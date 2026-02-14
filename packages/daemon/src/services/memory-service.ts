import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const MEMORY_DIR = path.join(os.homedir(), ".undoable", "memory");

export type MemoryEntry = {
  id: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  embedding?: number[];
};

type PersistedIndex = {
  version: 2;
  entries: MemoryEntry[];
};

export type SearchMode = "text" | "semantic" | "hybrid";

export type SearchResult = {
  entry: MemoryEntry;
  score: number;
  source: "text" | "vector";
};

/* ── Embedding Provider ── */

export type EmbeddingProvider = {
  id: string;
  dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
};

async function createOpenAIEmbeddingProvider(): Promise<EmbeddingProvider | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = "text-embedding-3-small";
  const dimensions = 1536;

  async function embed(text: string): Promise<number[]> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`OpenAI embedding failed: ${res.status}`);
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0]!.embedding;
  }

  async function embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`OpenAI batch embedding failed: ${res.status}`);
    const data = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }

  return { id: "openai", dimensions, embed, embedBatch };
}

/* ── Vector math ── */

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/* ── Memory Service ── */

export class MemoryService {
  private entries = new Map<string, MemoryEntry>();
  private indexFile = path.join(MEMORY_DIR, "index.json");
  private embeddingProvider: EmbeddingProvider | null = null;
  private embeddingReady = false;

  async init(): Promise<void> {
    await fsp.mkdir(MEMORY_DIR, { recursive: true });

    /* Load persisted entries */
    try {
      if (fs.existsSync(this.indexFile)) {
        const raw = await fsp.readFile(this.indexFile, "utf-8");
        const data = JSON.parse(raw) as PersistedIndex;
        for (const entry of data.entries) {
          this.entries.set(entry.id, entry);
        }
      }
    } catch { }

    /* Try to initialize embedding provider */
    const providerName = process.env.UNDOABLE_EMBEDDING_PROVIDER ?? "openai";
    if (providerName === "openai") {
      this.embeddingProvider = await createOpenAIEmbeddingProvider();
    }
    this.embeddingReady = this.embeddingProvider !== null;
  }

  get hasEmbeddings(): boolean {
    return this.embeddingReady;
  }

  private async persist(): Promise<void> {
    const data: PersistedIndex = {
      version: 2,
      entries: Array.from(this.entries.values()),
    };
    await fsp.writeFile(this.indexFile, JSON.stringify(data, null, 2), "utf-8");
  }

  async save(id: string, content: string, tags: string[] = []): Promise<MemoryEntry> {
    const existing = this.entries.get(id);
    const now = Date.now();

    let embedding: number[] | undefined;
    if (this.embeddingProvider) {
      try {
        embedding = await this.embeddingProvider.embed(content);
      } catch { /* non-fatal: save without embedding */ }
    }

    const entry: MemoryEntry = {
      id,
      content,
      tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      embedding,
    };
    this.entries.set(id, entry);
    await this.persist();
    return entry;
  }

  async remove(id: string): Promise<boolean> {
    const deleted = this.entries.delete(id);
    if (deleted) await this.persist();
    return deleted;
  }

  get(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }

  list(): MemoryEntry[] {
    return Array.from(this.entries.values())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /* ── Text-based search (FTS) ── */

  searchText(query: string, limit = 20): SearchResult[] {
    const lower = query.toLowerCase();
    const terms = lower.split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      return this.list()
        .slice(0, limit)
        .map((entry) => ({ entry, score: 1, source: "text" as const }));
    }

    const scored: SearchResult[] = [];
    for (const entry of this.entries.values()) {
      const text = `${entry.id} ${entry.content} ${entry.tags.join(" ")}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (text.includes(term)) score++;
      }
      if (score > 0) {
        scored.push({ entry, score: score / terms.length, source: "text" });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt)
      .slice(0, limit);
  }

  /* ── Semantic search (vector) ── */

  async searchSemantic(query: string, limit = 20): Promise<SearchResult[]> {
    if (!this.embeddingProvider) return [];

    let queryVec: number[];
    try {
      queryVec = await this.embeddingProvider.embed(query);
    } catch {
      return [];
    }

    const scored: SearchResult[] = [];
    for (const entry of this.entries.values()) {
      if (!entry.embedding) continue;
      const similarity = cosineSimilarity(queryVec, entry.embedding);
      if (similarity > 0) {
        scored.push({ entry, score: similarity, source: "vector" });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /* ── Hybrid search (text + vector merged) ── */

  async searchHybrid(
    query: string,
    limit = 20,
    weights?: { text?: number; vector?: number },
  ): Promise<SearchResult[]> {
    const textWeight = weights?.text ?? 0.3;
    const vectorWeight = weights?.vector ?? 0.7;

    const [textResults, vectorResults] = await Promise.all([
      this.searchText(query, limit * 2),
      this.searchSemantic(query, limit * 2),
    ]);

    /* Merge by ID, combining scores */
    const merged = new Map<string, { entry: MemoryEntry; textScore: number; vectorScore: number }>();

    for (const r of textResults) {
      merged.set(r.entry.id, {
        entry: r.entry,
        textScore: r.score,
        vectorScore: 0,
      });
    }

    for (const r of vectorResults) {
      const existing = merged.get(r.entry.id);
      if (existing) {
        existing.vectorScore = r.score;
      } else {
        merged.set(r.entry.id, {
          entry: r.entry,
          textScore: 0,
          vectorScore: r.score,
        });
      }
    }

    const results: SearchResult[] = [];
    for (const { entry, textScore, vectorScore } of merged.values()) {
      const combinedScore = textScore * textWeight + vectorScore * vectorWeight;
      const primarySource = vectorScore > textScore ? "vector" : "text";
      results.push({ entry, score: combinedScore, source: primarySource });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /* ── Unified search interface ── */

  async search(
    query: string,
    limit = 20,
    mode: SearchMode = "hybrid",
    minScore = 0,
  ): Promise<SearchResult[]> {
    let results: SearchResult[];

    switch (mode) {
      case "text":
        results = this.searchText(query, limit);
        break;
      case "semantic":
        results = await this.searchSemantic(query, limit);
        break;
      case "hybrid":
      default:
        results = this.embeddingProvider
          ? await this.searchHybrid(query, limit)
          : this.searchText(query, limit);
        break;
    }

    if (minScore > 0) {
      results = results.filter((r) => r.score >= minScore);
    }

    return results;
  }

  /* ── Re-index: embed all entries missing embeddings ── */

  async sync(): Promise<{ indexed: number; skipped: number; errors: number }> {
    if (!this.embeddingProvider) return { indexed: 0, skipped: 0, errors: 0 };

    const toEmbed: MemoryEntry[] = [];
    for (const entry of this.entries.values()) {
      if (!entry.embedding) toEmbed.push(entry);
    }

    if (toEmbed.length === 0) return { indexed: 0, skipped: this.entries.size, errors: 0 };

    let indexed = 0;
    let errors = 0;

    /* Batch in groups of 20 */
    const batchSize = 20;
    for (let i = 0; i < toEmbed.length; i += batchSize) {
      const batch = toEmbed.slice(i, i + batchSize);
      try {
        const embeddings = await this.embeddingProvider.embedBatch(batch.map((e) => e.content));
        for (let j = 0; j < batch.length; j++) {
          batch[j]!.embedding = embeddings[j];
          this.entries.set(batch[j]!.id, batch[j]!);
          indexed++;
        }
      } catch {
        errors += batch.length;
      }
    }

    await this.persist();
    return { indexed, skipped: this.entries.size - indexed - errors, errors };
  }

  loadWorkspaceMemory(workspaceDir: string): string | null {
    const memoryFile = path.join(workspaceDir, "MEMORY.md");
    try {
      if (fs.existsSync(memoryFile)) {
        return fs.readFileSync(memoryFile, "utf-8");
      }
    } catch { }
    return null;
  }
}
