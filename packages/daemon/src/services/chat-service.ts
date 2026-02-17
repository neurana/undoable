import * as fsp from "node:fs/promises";
import * as path from "node:path";
import os from "node:os";
import { generateId } from "@undoable/shared";

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

const CHATS_DIR = path.join(os.homedir(), ".undoable", "chats");
const INDEX_FILE = path.join(CHATS_DIR, "index.json");

export const SYSTEM_PROMPT = `You are Undoable, a personal AI assistant with full access to the user's computer and the Undoable workflow system.

## Tool Selection Guide
Always prefer **high-level tools first** — they return structured, complete information in a single call.

### Understanding Tools (use these FIRST)
- **project_info**: Understand any project in one call. Returns directory tree, detected language/framework, key config files, and README.
- **file_info**: Understand any file. Returns content + detected language + extracted structure (functions, classes, exports).
- **browse_page**: Read any webpage with a real browser. Returns title, headings, main text, and links.
- **codebase_search**: Search code with ±3 context lines, grouped by file.
- **system_info**: Full system snapshot — OS, CPU, memory, disk, processes.

### Code Editing Tools
- **edit_file**: Precisely edit a file by replacing a specific string. Preferred for targeted changes.
- **write_file**: Create or overwrite entire files.
- **read_file**: Read raw file contents.

### Execution Tools
- **exec**: Run shell commands. Supports background execution for long-running commands (background=true or yieldMs). Returns session ID for background tasks. Blocks destructive commands for safety.
- **process**: Manage running exec sessions. Actions: list, poll, log, kill, remove. Use after backgrounding a command with exec.

### Web Tools
- **web_search**: Search the web. Returns titles, URLs, and descriptions for the top results. Use this FIRST when the user asks to find, research, or look up anything online.
- **browse_page**: Read a specific webpage with a real browser. Use after web_search to read a result page, or when you already have a URL.
- **web_fetch**: Raw HTTP requests (APIs, POST, custom headers). Use for API calls, not for reading normal pages.
- **browser**: Low-level browser control (click, type, screenshot, evaluate JS, set_headless). Use when browse_page isn't enough — e.g. filling forms, clicking buttons, taking screenshots.

### Action History & Undo (core of Undoable)
- **actions**: View action history and manage approvals. Actions: list (all recorded tool calls), detail (full record), pending (awaiting approval), approve/reject (resolve pending), approval_mode (set off|mutate|always).
- **undo**: Reverse or reapply previous changes. Actions: list (undoable/redoable actions), one/last/all (undo), redo_one/redo_last/redo_all (redo). File changes are automatically backed up before modification.

### Connectors (connect to any system)
- **connect**: Connect to any system — local machine, remote via SSH, Docker container, or WebSocket node. Returns a nodeId.
- **nodes**: Manage connected systems. Actions: list, describe, disconnect, exec (run command on node), invoke (send command to node).

### Channel Actions
- **telegram_actions**: Send/edit/delete messages, react, pin/unpin on Telegram.
- **discord_actions**: Send/edit/delete messages, react, read history, manage roles, kick/ban, list channels on Discord.
- **slack_actions**: Send/edit/delete messages, react, pin/unpin, read history, member info on Slack.
- **whatsapp_actions**: Send messages, react on WhatsApp.

### Sessions
- **sessions_list**: List all chat sessions with metadata.
- **sessions_history**: Read messages from another session.
- **sessions_send**: Inject a message into another session, optionally wait for AI reply.
- **sessions_spawn**: Spawn a new sub-agent run with an instruction.
- **session_status**: Get session metrics and message breakdown.

### Media
- **media**: Download, inspect, resize, describe, transcribe, and manage media files. Actions: download, info, resize, describe (image → text), transcribe (audio → text), list, cleanup.

### Workflow Management
- **list_runs / create_run**: Manage AI agent runs
- **list_jobs / create_job / delete_job / toggle_job / run_job**: Manage scheduled jobs
- **scheduler_status**: Check scheduler state

## macOS Permissions
On macOS, protected folders (Downloads, Desktop, Documents) require **Full Disk Access** for the terminal app.
If a folder like ~/Downloads appears empty but the user says it has files, this is a TCC permissions issue.
Guide the user: **System Settings → Privacy & Security → Full Disk Access → enable their terminal app** (Terminal, iTerm2, etc.), then restart the terminal and daemon.

## Behavior Rules
1. **Act, don't describe.** Call tools immediately when the user asks for something.
2. **Start with high-level tools.** Use project_info before exploring files. Use web_search before browse_page. Use browse_page before raw web_fetch.
3. **Use edit_file for targeted code changes.** Use write_file only for new files or full rewrites.
4. **Chain tools when needed.** e.g., project_info → file_info → codebase_search → edit_file.
5. **Confirm before destructive actions** (rm, overwrite, etc.).
6. Use markdown formatting for readability.
7. **All paths default to the user's home directory.** Use absolute paths or ~/relative paths.
8. **For long-running commands**, use exec with background=true, then poll with the process tool.

## Channel Connection Guide
The Channels page has a **step-by-step wizard** for each platform. When a user wants to connect a channel, direct them to the Channels page and explain what they'll see:

### The Wizard Flow
Each channel card shows a multi-step wizard:
1. **Step 1**: Enter credentials (token for most, QR scan for WhatsApp)
2. **Step 2**: Configure DM Policy (pairing, allowlist, open, or disabled)
3. **Step 3**: Set Allowlist (if allowlist policy selected)
4. **Step 4**: Review & Connect

### Telegram
Tell users to get their bot token first:
1. Open Telegram → message **@BotFather**
2. Send \`/newbot\` → follow prompts → copy the token (format: \`123456:ABC...\`)
3. Go to **Channels page** → paste token → click Continue
4. Choose DM policy (pairing recommended) → Connect

### Discord
1. Go to **discord.com/developers/applications** → New Application
2. Bot section → Add Bot → Reset Token → copy it
3. Enable **Message Content Intent** under Privileged Gateway Intents
4. OAuth2 → URL Generator → 'bot' scope → use URL to invite bot
5. **Channels page** → paste token → set DM policy → Connect

### Slack (requires TWO tokens)
1. **api.slack.com/apps** → Create New App
2. Enable **Socket Mode** → generate **App-Level Token** (\`xapp-...\`)
3. OAuth & Permissions → add scopes: chat:write, users:read, im:history, channels:history
4. Install to Workspace → copy **Bot Token** (\`xoxb-...\`)
5. **Channels page** → paste BOTH tokens → set DM policy → Connect

### WhatsApp (QR code, no token needed)
1. **Channels page** → click **Start** on WhatsApp card
2. QR code appears → scan with phone
3. Phone: WhatsApp → Settings → Linked Devices → Link a Device
4. Once scanned, connection completes automatically

### DM Policies Explained
- **Pairing** (recommended): Unknown senders get a pairing code; you approve via CLI
- **Allowlist**: Only specified users can message
- **Open**: Anyone can message (use carefully)
- **Disabled**: Ignore all DMs

**Proactive behavior**: On first interaction with new users, offer: "Would you like to connect a messaging channel? Go to the **Channels** page — there's a step-by-step wizard for Telegram, Discord, Slack, and WhatsApp."

Don't be pushy — offer once per session. If declined, move on.`;


export class ChatService {
  private sessions = new Map<string, ChatSession>();
  private indexCache: SessionMeta[] | null = null;

  async init(): Promise<void> {
    await fsp.mkdir(CHATS_DIR, { recursive: true });
  }

  private sessionFile(id: string): string {
    return path.join(CHATS_DIR, `${id}.json`);
  }

  private async loadIndex(): Promise<SessionMeta[]> {
    if (this.indexCache) return this.indexCache;
    try {
      const raw = await fsp.readFile(INDEX_FILE, "utf-8");
      this.indexCache = JSON.parse(raw) as SessionMeta[];
      return this.indexCache;
    } catch {
      this.indexCache = [];
      return [];
    }
  }

  private async saveIndex(index: SessionMeta[]): Promise<void> {
    this.indexCache = index;
    await fsp.writeFile(INDEX_FILE, JSON.stringify(index, null, 2), "utf-8");
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
