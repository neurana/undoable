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

export const SYSTEM_PROMPT = buildSystemPrompt({});


export class ChatService {
  private sessions = new Map<string, ChatSession>();
  private indexCache: SessionMeta[] | null = null;
  private chatsDir: string;
  private indexFile: string;

  constructor(opts?: { chatsDir?: string }) {
    const configured = opts?.chatsDir?.trim() || process.env.UNDOABLE_CHATS_DIR?.trim();
    this.chatsDir = configured ? path.resolve(configured) : DEFAULT_CHATS_DIR;
    this.indexFile = path.join(this.chatsDir, "index.json");
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

  private async persistSession(session: ChatSession): Promise<void> {
    await this.init();
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
    index.sort((a, b) => b.updatedAt - a.updatedAt);
    await this.saveIndex(index);
  }

  async listSessions(): Promise<SessionMeta[]> {
    return this.loadIndex();
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
    this.sessions.set(id, session);
    await this.persistSession(session);
    return session;
  }

  async getOrCreate(sessionId: string, createOpts?: { systemPrompt?: string; agentId?: string }): Promise<ChatSession> {
    let session = this.sessions.get(sessionId);
    if (session) return session;

    try {
      const raw = await fsp.readFile(this.sessionFile(sessionId), "utf-8");
      session = JSON.parse(raw) as ChatSession;
      this.sessions.set(sessionId, session);
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
      this.sessions.set(sessionId, session);
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
      this.sessions.set(sessionId, session);
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
