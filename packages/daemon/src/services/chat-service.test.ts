import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { ChatService, SYSTEM_PROMPT } from "./chat-service.js";

let service: ChatService;
let uid: () => string;

beforeEach(async () => {
  service = new ChatService();
  await service.init();
  let counter = 0;
  const prefix = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  uid = () => `${prefix}-${++counter}`;
});

describe("ChatService", () => {
  describe("createSession", () => {
    it("creates a session with default system prompt", async () => {
      const session = await service.createSession();
      expect(session.id).toBeTruthy();
      expect(session.title).toBe("New conversation");
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]!.role).toBe("system");
      expect(session.messages[0]!.content).toBe(SYSTEM_PROMPT);
      expect(SYSTEM_PROMPT).toContain("## Capability Grounding");
    });

    it("creates a session with custom system prompt", async () => {
      const custom = "You are a test bot.";
      const session = await service.createSession({ systemPrompt: custom });
      expect(session.messages[0]!.content).toBe(custom);
    });

    it("generates a unique id", async () => {
      const s1 = await service.createSession();
      const s2 = await service.createSession();
      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe("getOrCreate", () => {
    it("creates session with the provided sessionId", async () => {
      const id = uid();
      const session = await service.getOrCreate(id);
      expect(session.id).toBe(id);
    });

    it("returns existing session if already in memory", async () => {
      const id = uid();
      const first = await service.getOrCreate(id);
      const second = await service.getOrCreate(id);
      expect(first).toBe(second);
    });

    it("preserves custom system prompt on new session", async () => {
      const id = uid();
      const custom = "Execute tasks autonomously.";
      const session = await service.getOrCreate(id, { systemPrompt: custom });
      expect(session.id).toBe(id);
      expect(session.messages[0]!.content).toBe(custom);
    });

    it("uses default system prompt when no custom prompt provided", async () => {
      const id = uid();
      const session = await service.getOrCreate(id);
      expect(session.messages[0]!.content).toBe(SYSTEM_PROMPT);
    });

    it("subsequent addUserMessage uses same session with custom prompt", async () => {
      const id = uid();
      const custom = "You are autonomous.";
      await service.getOrCreate(id, { systemPrompt: custom });
      const session = await service.addUserMessage(id, "do something");
      expect(session.id).toBe(id);
      expect(session.messages[0]!.content).toBe(custom);
      expect(session.messages).toHaveLength(2);
      expect(session.messages[1]!.role).toBe("user");
    });

    it("sets agentId when provided", async () => {
      const id = uid();
      const session = await service.getOrCreate(id, { agentId: "gpt-4" });
      expect(session.agentId).toBe("gpt-4");
    });

    it("does not generate random id when creating new session", async () => {
      const id = uid();
      const session = await service.getOrCreate(id);
      expect(session.id).toBe(id);
      const retrieved = await service.getOrCreate(id);
      expect(retrieved.id).toBe(id);
      expect(retrieved).toBe(session);
    });
  });

  describe("addUserMessage", () => {
    it("adds user message to session", async () => {
      const id = uid();
      await service.getOrCreate(id);
      const session = await service.addUserMessage(id, "hello");
      const userMsgs = session.messages.filter((m) => m.role === "user");
      expect(userMsgs).toHaveLength(1);
    });

    it("auto-titles session from first user message", async () => {
      const id = uid();
      await service.getOrCreate(id);
      const session = await service.addUserMessage(id, "Fix the login page bug");
      expect(session.title).toBe("Fix the login page bug");
    });
  });

  describe("getHistory", () => {
    it("excludes system messages", async () => {
      const id = uid();
      await service.getOrCreate(id);
      await service.addUserMessage(id, "hello");
      const history = await service.getHistory(id);
      expect(history.every((m) => m.role !== "system")).toBe(true);
      expect(history).toHaveLength(1);
    });
  });

  describe("deleteSession", () => {
    it("removes session from memory", async () => {
      const id = uid();
      await service.getOrCreate(id);
      const deleted = await service.deleteSession(id);
      expect(deleted).toBe(true);
      const loaded = await service.loadSession(id);
      expect(loaded).toBeNull();
    });
  });

  describe("resetSession", () => {
    it("keeps only system message", async () => {
      const id = uid();
      await service.getOrCreate(id);
      await service.addUserMessage(id, "hello");
      await service.addAssistantMessage(id, "hi");
      const result = await service.resetSession(id);
      expect(result).toBe(true);
      const session = await service.loadSession(id);
      expect(session!.messages).toHaveLength(1);
      expect(session!.messages[0]!.role).toBe("system");
      expect(session!.title).toBe("New conversation");
    });
  });

  describe("persistent session (cron pattern)", () => {
    it("accumulates messages across multiple addUserMessage calls to same session", async () => {
      const cronId = `cron-${uid()}`;
      const sysPrompt = "You are a scheduled job.";
      await service.getOrCreate(cronId, { systemPrompt: sysPrompt });

      await service.addUserMessage(cronId, "Run 1: check disk");
      await service.addAssistantMessage(cronId, "Disk OK, 50% used");

      await service.addUserMessage(cronId, "Run 2: check disk");
      await service.addAssistantMessage(cronId, "Disk OK, 52% used");

      const session = await service.getOrCreate(cronId);
      expect(session.messages[0]!.role).toBe("system");
      expect(session.messages[0]!.content).toBe(sysPrompt);
      const userMsgs = session.messages.filter((m) => m.role === "user");
      expect(userMsgs).toHaveLength(2);
      const assistantMsgs = session.messages.filter((m) => m.role === "assistant");
      expect(assistantMsgs).toHaveLength(2);
      expect(session.messages).toHaveLength(5);
    });

    it("preserves system prompt across session reuse", async () => {
      const cronId = `cron-${uid()}`;
      const sysPrompt = "Execute scheduled tasks.";
      await service.getOrCreate(cronId, { systemPrompt: sysPrompt });
      await service.addUserMessage(cronId, "first task");

      const session = await service.getOrCreate(cronId);
      expect(session.messages[0]!.content).toBe(sysPrompt);
      expect(session.id).toBe(cronId);
    });

    it("getHistory returns all non-system messages from persistent session", async () => {
      const cronId = `cron-${uid()}`;
      await service.getOrCreate(cronId, { systemPrompt: "Job runner." });
      await service.addUserMessage(cronId, "run 1");
      await service.addAssistantMessage(cronId, "done 1");
      await service.addUserMessage(cronId, "run 2");
      await service.addAssistantMessage(cronId, "done 2");

      const history = await service.getHistory(cronId);
      expect(history).toHaveLength(4);
      expect(history.every((m) => m.role !== "system")).toBe(true);
    });
  });

  describe("retention and compaction", () => {
    it("compacts session message history to configured max size", async () => {
      const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), "undoable-chat-compact-"),
      );
      const compactService = new ChatService({
        chatsDir: dir,
        maxMessagesPerSession: 4,
      });
      await compactService.init();

      const sessionId = `compact-${uid()}`;
      await compactService.getOrCreate(sessionId);
      await compactService.addUserMessage(sessionId, "u1");
      await compactService.addAssistantMessage(sessionId, "a1");
      await compactService.addUserMessage(sessionId, "u2");
      await compactService.addAssistantMessage(sessionId, "a2");
      await compactService.addUserMessage(sessionId, "u3");

      const session = await compactService.loadSession(sessionId);
      expect(session).toBeTruthy();
      expect(session!.messages.length).toBeLessThanOrEqual(4);
      expect(session!.messages[0]!.role).toBe("system");

      await fs.rm(dir, { recursive: true, force: true });
    });

    it("retains only the newest sessions and deletes old session files", async () => {
      const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), "undoable-chat-retention-"),
      );
      const retentionService = new ChatService({
        chatsDir: dir,
        maxSessions: 2,
      });
      await retentionService.init();

      const ids = [`s-${uid()}`, `s-${uid()}`, `s-${uid()}`];
      await retentionService.addUserMessage(ids[0]!, "first");
      await retentionService.addUserMessage(ids[1]!, "second");
      await retentionService.addUserMessage(ids[2]!, "third");

      const sessions = await retentionService.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions.map((entry) => entry.id)).toEqual([ids[2], ids[1]]);

      const removed = await retentionService.loadSession(ids[0]!);
      expect(removed).toBeNull();

      await fs.rm(dir, { recursive: true, force: true });
    });
  });
});
