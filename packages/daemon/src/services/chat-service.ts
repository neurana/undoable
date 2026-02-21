import * as fsp from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { generateId } from "@undoable/shared";
import { buildSystemPrompt } from "./system-prompt-builder.js";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentBlock[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type SessionMeta = {
  id: string;
  title: string;
  agentId?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
};

export type ChatSession = {
  id: string;
  title: string;
  agentId?: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

const DEFAULT_CHATS_DIR = path.join(os.homedir(), ".undoable", "chats");
const FALLBACK_CHATS_DIR = path.join(os.tmpdir(), "undoable", "chats");
const DEFAULT_MAX_SESSIONS = 1000;
const DEFAULT_MAX_MESSAGES_PER_SESSION = 4000;
const DEFAULT_MAX_CACHED_SESSIONS = 128;

export const SYSTEM_PROMPT = buildSystemPrompt({});

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  min = 1,
): number {
  if (typeof raw !== "string" || raw.trim().length === 0) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  if (rounded < min) return fallback;
  return rounded;
}

function toEpochMs(value: number | string | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export class ChatService {
  private sessions = new Map<string, ChatSession>();
  private indexCache: SessionMeta[] | null = null;
  private chatsDir: string;
  private indexFile: string;
  private readonly maxSessions: number;
  private readonly maxMessagesPerSession: number;
  private readonly maxCachedSessions: number;
  private readonly retentionMs: number | null;

  constructor(opts?: {
    chatsDir?: string;
    maxSessions?: number;
    maxMessagesPerSession?: number;
    maxCachedSessions?: number;
    retentionDays?: number;
  }) {
    const configured = opts?.chatsDir?.trim() || process.env.UNDOABLE_CHATS_DIR?.trim();
    this.chatsDir = configured ? path.resolve(configured) : DEFAULT_CHATS_DIR;
    this.indexFile = path.join(this.chatsDir, "index.json");
    this.maxSessions = Math.max(
      1,
      opts?.maxSessions ??
        parsePositiveInt(
          process.env.UNDOABLE_CHAT_MAX_SESSIONS,
          DEFAULT_MAX_SESSIONS,
        ),
    );
    this.maxMessagesPerSession = Math.max(
      2,
      opts?.maxMessagesPerSession ??
        parsePositiveInt(
          process.env.UNDOABLE_CHAT_MAX_MESSAGES_PER_SESSION,
          DEFAULT_MAX_MESSAGES_PER_SESSION,
          2,
        ),
    );
    this.maxCachedSessions = Math.max(
      1,
      opts?.maxCachedSessions ??
        parsePositiveInt(
          process.env.UNDOABLE_CHAT_CACHE_MAX_SESSIONS,
          DEFAULT_MAX_CACHED_SESSIONS,
        ),
    );
    const retentionDaysRaw =
      typeof opts?.retentionDays === "number"
        ? String(opts.retentionDays)
        : process.env.UNDOABLE_CHAT_RETENTION_DAYS;
    const retentionDays = parsePositiveInt(retentionDaysRaw, 0, 0);
    this.retentionMs =
      retentionDays > 0 ? retentionDays * 24 * 60 * 60 * 1000 : null;
  }

  private async ensureWritableChatsDir(dir: string): Promise<boolean> {
    try {
      await fsp.mkdir(dir, { recursive: true });
      await fsp.access(dir, fsConstants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    if (await this.ensureWritableChatsDir(this.chatsDir)) return;

    if (this.chatsDir !== FALLBACK_CHATS_DIR && await this.ensureWritableChatsDir(FALLBACK_CHATS_DIR)) {
      this.chatsDir = FALLBACK_CHATS_DIR;
      this.indexFile = path.join(this.chatsDir, "index.json");
      return;
    }

    throw new Error(
      `Unable to initialize chat storage. Checked: ${this.chatsDir}${this.chatsDir === FALLBACK_CHATS_DIR ? "" : `, ${FALLBACK_CHATS_DIR}`}`,
    );
  }

  private sessionFile(id: string): string {
    return path.join(this.chatsDir, `${id}.json`);
  }

  private async loadIndex(): Promise<SessionMeta[]> {
    if (this.indexCache) return this.indexCache;
    try {
      const raw = await fsp.readFile(this.indexFile, "utf-8");
      this.indexCache = JSON.parse(raw) as SessionMeta[];
      return this.indexCache;
    } catch {
      this.indexCache = [];
      return [];
    }
  }

  private async saveIndex(index: SessionMeta[]): Promise<void> {
    this.indexCache = index;
    await fsp.writeFile(this.indexFile, JSON.stringify(index, null, 2), "utf-8");
  }

  private touchSessionCache(session: ChatSession): void {
    if (this.sessions.has(session.id)) {
      this.sessions.delete(session.id);
    }
    this.sessions.set(session.id, session);
    while (this.sessions.size > this.maxCachedSessions) {
      const oldest = this.sessions.keys().next().value as string | undefined;
      if (!oldest) break;
      this.sessions.delete(oldest);
    }
  }

  private compactSessionMessages(session: ChatSession): void {
    if (session.messages.length <= this.maxMessagesPerSession) return;
    const system = session.messages.find((entry) => entry.role === "system");
    const nonSystem = session.messages.filter((entry) => entry.role !== "system");
    const maxNonSystem = Math.max(
      0,
      this.maxMessagesPerSession - (system ? 1 : 0),
    );
    session.messages = [
      ...(system ? [system] : []),
      ...nonSystem.slice(-maxNonSystem),
    ];
    session.updatedAt = Date.now();
  }

  private applyIndexRetention(index: SessionMeta[]): {
    retained: SessionMeta[];
    removedIds: string[];
  } {
    const sorted = [...index].sort((a, b) => b.updatedAt - a.updatedAt);
    const retentionMs = this.retentionMs;
    const fresh = retentionMs
      ? sorted.filter(
          (entry) => Date.now() - toEpochMs(entry.updatedAt) <= retentionMs,
        )
      : sorted;
    const retained = fresh.slice(0, this.maxSessions);
    const retainedIds = new Set(retained.map((entry) => entry.id));
    const removedIds = sorted
      .map((entry) => entry.id)
      .filter((id) => !retainedIds.has(id));
    return { retained, removedIds };
  }

  private async removeSessionFiles(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.sessions.delete(id);
      try {
        await fsp.unlink(this.sessionFile(id));
      } catch {
        // best effort cleanup
      }
    }
  }

  private async persistSession(session: ChatSession): Promise<void> {
    await this.init();
    this.compactSessionMessages(session);
    this.touchSessionCache(session);
    await fsp.writeFile(this.sessionFile(session.id), JSON.stringify(session), "utf-8");
    await this.updateIndex(session);
  }

  private async updateIndex(session: ChatSession): Promise<void> {
    const index = await this.loadIndex();
    const userMsgs = session.messages.filter((m) => m.role === "user");
    const preview = userMsgs.length > 0
      ? (userMsgs[userMsgs.length - 1]! as { content: string }).content.slice(0, 120)
      : "";
    const existing = index.findIndex((m) => m.id === session.id);
    const meta: SessionMeta = {
      id: session.id,
      title: session.title,
      agentId: session.agentId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.filter((m) => m.role !== "system").length,
      preview,
    };
    if (existing >= 0) {
      index[existing] = meta;
    } else {
      index.unshift(meta);
    }
    const { retained, removedIds } = this.applyIndexRetention(index);
    await this.saveIndex(retained);
    if (removedIds.length > 0) {
      await this.removeSessionFiles(removedIds);
    }
  }

  async listSessions(opts?: { limit?: number }): Promise<SessionMeta[]> {
    const all = await this.loadIndex();
    const limit = opts?.limit;
    if (!Number.isFinite(limit) || !limit || limit <= 0) return all;
    return all.slice(0, Math.floor(limit));
  }

  async createSession(opts?: { title?: string; systemPrompt?: string; agentId?: string }): Promise<ChatSession> {
    const id = generateId();
    const now = Date.now();
    const session: ChatSession = {
      id,
      title: opts?.title ?? "New conversation",
      agentId: opts?.agentId,
      messages: [{ role: "system", content: opts?.systemPrompt ?? SYSTEM_PROMPT }],
      createdAt: now,
      updatedAt: now,
    };
    this.touchSessionCache(session);
    await this.persistSession(session);
    return session;
  }

  async getOrCreate(sessionId: string, createOpts?: { systemPrompt?: string; agentId?: string }): Promise<ChatSession> {
    let session = this.sessions.get(sessionId);
    if (session) return session;

    try {
      const raw = await fsp.readFile(this.sessionFile(sessionId), "utf-8");
      session = JSON.parse(raw) as ChatSession;
      this.touchSessionCache(session);
      return session;
    } catch {
      const now = Date.now();
      session = {
        id: sessionId,
        title: "New conversation",
        agentId: createOpts?.agentId,
        messages: [{ role: "system" as const, content: createOpts?.systemPrompt ?? SYSTEM_PROMPT }],
        createdAt: now,
        updatedAt: now,
      };
      this.touchSessionCache(session);
      await this.persistSession(session);
      return session;
    }
  }

  async loadSession(sessionId: string): Promise<ChatSession | null> {
    const cached = this.sessions.get(sessionId);
    if (cached) return cached;
    try {
      const raw = await fsp.readFile(this.sessionFile(sessionId), "utf-8");
      const session = JSON.parse(raw) as ChatSession;
      this.touchSessionCache(session);
      return session;
    } catch {
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    this.sessions.delete(sessionId);
    try { await fsp.unlink(this.sessionFile(sessionId)); } catch { }
    const index = await this.loadIndex();
    const filtered = index.filter((m) => m.id !== sessionId);
    if (filtered.length === index.length) return false;
    await this.saveIndex(filtered);
    return true;
  }

  async cleanupEmptySessions(): Promise<number> {
    const index = await this.loadIndex();
    const toDelete = index.filter((s) => s.messageCount === 0 && s.title === "New conversation");
    for (const s of toDelete) {
      this.sessions.delete(s.id);
      try { await fsp.unlink(this.sessionFile(s.id)); } catch { }
    }
    if (toDelete.length > 0) {
      const remaining = index.filter((s) => !(s.messageCount === 0 && s.title === "New conversation"));
      await this.saveIndex(remaining);
    }
    return toDelete.length;
  }

  async renameSession(sessionId: string, title: string): Promise<boolean> {
    const session = await this.loadSession(sessionId);
    if (!session) return false;
    session.title = title;
    await this.persistSession(session);
    return true;
  }

  async resetSession(sessionId: string): Promise<boolean> {
    const session = await this.loadSession(sessionId);
    if (!session) return false;
    const systemMsg = session.messages.find((m) => m.role === "system");
    session.messages = systemMsg ? [systemMsg] : [];
    session.title = "New conversation";
    session.updatedAt = Date.now();
    await this.persistSession(session);
    return true;
  }

  async addUserMessage(sessionId: string, content: string): Promise<ChatSession> {
    const session = await this.getOrCreate(sessionId);
    session.messages.push({ role: "user", content });
    session.updatedAt = Date.now();
    if (session.title === "New conversation") {
      session.title = content.slice(0, 60) + (content.length > 60 ? "..." : "");
    }
    await this.persistSession(session);
    return session;
  }

  async addUserMessageWithImages(
    sessionId: string,
    text: string,
    images: Array<{ data: string; mimeType: string }>,
    textBlocks?: string[],
  ): Promise<ChatSession> {
    const session = await this.getOrCreate(sessionId);
    const blocks: ContentBlock[] = [];
    const fullText = textBlocks?.length ? `${text}\n\n${textBlocks.join("\n\n")}` : text;
    if (fullText) blocks.push({ type: "text", text: fullText });
    for (const img of images) {
      blocks.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.data}` } });
    }
    const first = blocks[0];
    session.messages.push({ role: "user", content: blocks.length === 1 && first?.type === "text" ? fullText : blocks });
    session.updatedAt = Date.now();
    if (session.title === "New conversation") {
      const titleSrc = text || "Image attachment";
      session.title = titleSrc.slice(0, 60) + (titleSrc.length > 60 ? "..." : "");
    }
    await this.persistSession(session);
    return session;
  }

  async addAssistantToolCalls(sessionId: string, toolCalls: ToolCall[]): Promise<void> {
    const session = await this.getOrCreate(sessionId);
    session.messages.push({ role: "assistant", content: null, tool_calls: toolCalls });
    session.updatedAt = Date.now();
    await this.persistSession(session);
  }

  async addToolResult(sessionId: string, toolCallId: string, result: string): Promise<void> {
    const session = await this.getOrCreate(sessionId);
    session.messages.push({ role: "tool", tool_call_id: toolCallId, content: result });
    session.updatedAt = Date.now();
    await this.persistSession(session);
  }

  async addAssistantMessage(sessionId: string, content: string): Promise<void> {
    const session = await this.getOrCreate(sessionId);
    session.messages.push({ role: "assistant", content });
    session.updatedAt = Date.now();
    await this.persistSession(session);
  }

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    const session = await this.loadSession(sessionId);
    if (!session) return [];
    return session.messages.filter((m) => m.role !== "system");
  }

  async injectSystemMessage(sessionId: string, content: string): Promise<void> {
    const session = await this.getOrCreate(sessionId);
    session.messages.push({ role: "system", content });
    session.updatedAt = Date.now();
    await this.persistSession(session);
  }

  async buildApiMessages(sessionId: string): Promise<ChatMessage[]> {
    const session = await this.loadSession(sessionId);
    if (!session) return [];
    return [...session.messages];
  }
}
