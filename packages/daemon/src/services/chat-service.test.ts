import { describe, it, expect, beforeEach } from "vitest";
import { ChatService, SYSTEM_PROMPT } from "./chat-service.js";

let service: ChatService;

beforeEach(async () => {
  service = new ChatService();
  await service.init();
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
      const session = await service.getOrCreate("my-session-id");
      expect(session.id).toBe("my-session-id");
    });

    it("returns existing session if already in memory", async () => {
      const first = await service.getOrCreate("sess-1");
      const second = await service.getOrCreate("sess-1");
      expect(first).toBe(second);
    });

    it("preserves custom system prompt on new session", async () => {
      const custom = "Execute tasks autonomously.";
      const session = await service.getOrCreate("run-123", { systemPrompt: custom });
      expect(session.id).toBe("run-123");
      expect(session.messages[0]!.content).toBe(custom);
    });

    it("uses default system prompt when no custom prompt provided", async () => {
      const session = await service.getOrCreate("sess-default");
      expect(session.messages[0]!.content).toBe(SYSTEM_PROMPT);
    });

    it("subsequent addUserMessage uses same session with custom prompt", async () => {
      const custom = "You are autonomous.";
      await service.getOrCreate("run-456", { systemPrompt: custom });
      const session = await service.addUserMessage("run-456", "do something");
      expect(session.id).toBe("run-456");
      expect(session.messages[0]!.content).toBe(custom);
      expect(session.messages).toHaveLength(2);
      expect(session.messages[1]!.role).toBe("user");
    });

    it("sets agentId when provided", async () => {
      const session = await service.getOrCreate("agent-test", { agentId: "gpt-4" });
      expect(session.agentId).toBe("gpt-4");
    });

    it("does not generate random id when creating new session", async () => {
      const session = await service.getOrCreate("exact-id-123");
      expect(session.id).toBe("exact-id-123");
      const retrieved = await service.getOrCreate("exact-id-123");
      expect(retrieved.id).toBe("exact-id-123");
      expect(retrieved).toBe(session);
    });
  });

  describe("addUserMessage", () => {
    it("adds user message to session", async () => {
      await service.getOrCreate("msg-test");
      const session = await service.addUserMessage("msg-test", "hello");
      const userMsgs = session.messages.filter((m) => m.role === "user");
      expect(userMsgs).toHaveLength(1);
    });

    it("auto-titles session from first user message", async () => {
      await service.getOrCreate("title-test");
      const session = await service.addUserMessage("title-test", "Fix the login page bug");
      expect(session.title).toBe("Fix the login page bug");
    });
  });

  describe("getHistory", () => {
    it("excludes system messages", async () => {
      await service.getOrCreate("hist-test");
      await service.addUserMessage("hist-test", "hello");
      const history = await service.getHistory("hist-test");
      expect(history.every((m) => m.role !== "system")).toBe(true);
      expect(history).toHaveLength(1);
    });
  });

  describe("deleteSession", () => {
    it("removes session from memory", async () => {
      await service.getOrCreate("del-test");
      const deleted = await service.deleteSession("del-test");
      expect(deleted).toBe(true);
      const loaded = await service.loadSession("del-test");
      expect(loaded).toBeNull();
    });
  });

  describe("resetSession", () => {
    it("keeps only system message", async () => {
      await service.getOrCreate("reset-test");
      await service.addUserMessage("reset-test", "hello");
      await service.addAssistantMessage("reset-test", "hi");
      const result = await service.resetSession("reset-test");
      expect(result).toBe(true);
      const session = await service.loadSession("reset-test");
      expect(session!.messages).toHaveLength(1);
      expect(session!.messages[0]!.role).toBe("system");
      expect(session!.title).toBe("New conversation");
    });
  });
});
