import * as fsp from "node:fs/promises";
import * as path from "node:path";
import os from "node:os";

const USAGE_FILE = path.join(os.homedir(), ".undoable", "usage.json");
const MAX_RECORDS = 10_000;

export type UsageRecord = {
  sessionId: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  timestamp: number;
};

type PriceEntry = { input: number; output: number }; // per 1M tokens

const PRICE_TABLE: Record<string, PriceEntry> = {
  "gpt-5.2": { input: 2, output: 8 },
  "gpt-5.2-pro": { input: 5, output: 20 },
  "gpt-5.1": { input: 2, output: 8 },
  "gpt-5": { input: 2, output: 8 },
  "gpt-5-mini": { input: 0.4, output: 1.6 },
  "gpt-5-nano": { input: 0.1, output: 0.4 },
  "o3": { input: 10, output: 40 },
  "o3-pro": { input: 20, output: 80 },
  "o4-mini": { input: 1.1, output: 4.4 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "claude-opus-4-6-20260204": { input: 15, output: 75 },
  "claude-opus-4-5-20250826": { input: 15, output: 75 },
  "claude-sonnet-4-5-20250514": { input: 3, output: 15 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-haiku-3-5-20241022": { input: 0.8, output: 4 },
  "deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  "gemini-3-pro-preview": { input: 1.25, output: 5 },
  "gemini-3-flash-preview": { input: 0.15, output: 0.6 },
  "gemini-2.5-pro": { input: 1.25, output: 5 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
};

export class UsageService {
  private records: UsageRecord[] = [];
  private dirty = false;
  private saveTimer: ReturnType<typeof setInterval> | null = null;

  async init(): Promise<void> {
    try {
      const raw = await fsp.readFile(USAGE_FILE, "utf-8");
      this.records = JSON.parse(raw) as UsageRecord[];
    } catch {
      this.records = [];
    }
    // Periodic save every 30s if dirty
    this.saveTimer = setInterval(() => {
      if (this.dirty) this.persist().catch(() => {});
    }, 30_000);
  }

  async destroy(): Promise<void> {
    if (this.saveTimer) clearInterval(this.saveTimer);
    if (this.dirty) await this.persist();
  }

  record(entry: Omit<UsageRecord, "costUsd" | "timestamp">): UsageRecord {
    const costUsd = this.estimateCost(entry.model, entry.promptTokens, entry.completionTokens);
    const record: UsageRecord = {
      ...entry,
      costUsd,
      timestamp: Date.now(),
    };
    this.records.push(record);
    if (this.records.length > MAX_RECORDS) {
      this.records = this.records.slice(-MAX_RECORDS);
    }
    this.dirty = true;
    return record;
  }

  getSessionCost(sessionId: string): number {
    return this.records
      .filter((r) => r.sessionId === sessionId)
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  getTotalCost(sinceMs?: number): number {
    const cutoff = sinceMs ? Date.now() - sinceMs : 0;
    return this.records
      .filter((r) => r.timestamp >= cutoff)
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  getSummary(days?: number): {
    totalCostUsd: number;
    totalTokens: number;
    recordCount: number;
    byModel: Record<string, number>;
    bySession: Record<string, number>;
  } {
    const cutoff = days ? Date.now() - days * 86_400_000 : 0;
    const filtered = this.records.filter((r) => r.timestamp >= cutoff);

    const byModel: Record<string, number> = {};
    const bySession: Record<string, number> = {};
    let totalCostUsd = 0;
    let totalTokens = 0;

    for (const r of filtered) {
      totalCostUsd += r.costUsd;
      totalTokens += r.totalTokens;
      byModel[r.model] = (byModel[r.model] ?? 0) + r.costUsd;
      bySession[r.sessionId] = (bySession[r.sessionId] ?? 0) + r.costUsd;
    }

    return { totalCostUsd, totalTokens, recordCount: filtered.length, byModel, bySession };
  }

  getDailyBreakdown(days = 30): Array<{ date: string; costUsd: number; tokens: number; calls: number }> {
    const cutoff = Date.now() - days * 86_400_000;
    const daily = new Map<string, { costUsd: number; tokens: number; calls: number }>();

    for (const r of this.records) {
      if (r.timestamp < cutoff) continue;
      const date = new Date(r.timestamp).toISOString().slice(0, 10);
      const entry = daily.get(date) ?? { costUsd: 0, tokens: 0, calls: 0 };
      entry.costUsd += r.costUsd;
      entry.tokens += r.totalTokens;
      entry.calls += 1;
      daily.set(date, entry);
    }

    return Array.from(daily.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private estimateCost(model: string, promptTokens: number, completionTokens: number): number {
    const price = PRICE_TABLE[model];
    if (!price) return 0;
    return (promptTokens * price.input + completionTokens * price.output) / 1_000_000;
  }

  private async persist(): Promise<void> {
    try {
      await fsp.mkdir(path.dirname(USAGE_FILE), { recursive: true });
      await fsp.writeFile(USAGE_FILE, JSON.stringify(this.records), "utf-8");
      this.dirty = false;
    } catch {
      // Best effort
    }
  }
}
