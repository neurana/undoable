import os from "node:os";
import type { AgentTool } from "./types.js";
import type { ChatService, ChatMessage } from "../services/chat-service.js";
import type { RunManager } from "../services/run-manager.js";
import type { EventBus } from "@undoable/core";
import type { CallLLMFn } from "../services/run-executor.js";
import type { ToolRegistry } from "./index.js";
import { buildSystemPrompt } from "../services/system-prompt-builder.js";

export type SessionToolsDeps = {
  chatService: ChatService;
  runManager: RunManager;
  eventBus: EventBus;
  callLLM: CallLLMFn;
  registry: ToolRegistry;
};

const MAX_CONTENT_LENGTH = 2000;

function truncateContent(msg: ChatMessage): ChatMessage {
  if (msg.role === "user" && typeof msg.content === "string" && msg.content.length > MAX_CONTENT_LENGTH) {
    return { ...msg, content: msg.content.slice(0, MAX_CONTENT_LENGTH) + "…" };
  }
  if (msg.role === "assistant" && typeof msg.content === "string" && msg.content && msg.content.length > MAX_CONTENT_LENGTH) {
    return { ...msg, content: msg.content.slice(0, MAX_CONTENT_LENGTH) + "…" };
  }
  if (msg.role === "tool" && msg.content.length > MAX_CONTENT_LENGTH) {
    return { ...msg, content: msg.content.slice(0, MAX_CONTENT_LENGTH) + "…" };
  }
  return msg;
}

export function createSessionTools(deps: SessionToolsDeps): AgentTool[] {
  const { chatService, runManager, eventBus, callLLM, registry } = deps;
  const defaultSessionPrompt = buildSystemPrompt({
    toolDefinitions: registry.definitions,
    workspaceDir: os.homedir(),
    runtime: {
      os: `${os.platform()} ${os.release()}`,
      arch: os.arch(),
      node: process.version,
    },
  });

  return [
    {
      name: "sessions_list",
      definition: {
        type: "function",
        function: {
          name: "sessions_list",
          description: "List all chat sessions with metadata (id, title, message count, last activity, preview).",
          parameters: {
            type: "object",
            properties: {
              limit: { type: "number", description: "Max sessions to return (default 20)" },
              active_minutes: { type: "number", description: "Only show sessions active within the last N minutes" },
            },
            required: [],
          },
        },
      },
      execute: async (args) => {
        const limit = Math.min(100, Math.max(1, (args.limit as number) ?? 20));
        const activeMinutes = args.active_minutes as number | undefined;

        let sessions = await chatService.listSessions();

        if (activeMinutes && activeMinutes > 0) {
          const cutoff = Date.now() - activeMinutes * 60 * 1000;
          sessions = sessions.filter((s) => s.updatedAt >= cutoff);
        }

        return {
          sessions: sessions.slice(0, limit).map((s) => ({
            id: s.id,
            title: s.title,
            agentId: s.agentId,
            messageCount: s.messageCount,
            preview: s.preview,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          })),
          total: sessions.length,
        };
      },
    },

    {
      name: "sessions_history",
      definition: {
        type: "function",
        function: {
          name: "sessions_history",
          description: "Read message history from a specific session. Returns user and assistant messages, optionally including tool calls.",
          parameters: {
            type: "object",
            properties: {
              session_id: { type: "string", description: "Session ID to read from" },
              limit: { type: "number", description: "Max messages to return (default 20, max 50)" },
              include_tools: { type: "boolean", description: "Include tool call/result messages (default false)" },
            },
            required: ["session_id"],
          },
        },
      },
      execute: async (args) => {
        const sessionId = args.session_id as string;
        const limit = Math.min(50, Math.max(1, (args.limit as number) ?? 20));
        const includeTools = (args.include_tools as boolean) ?? false;

        const session = await chatService.loadSession(sessionId);
        if (!session) return { error: `Session not found: ${sessionId}` };

        let messages = await chatService.getHistory(sessionId);
        if (!includeTools) {
          messages = messages.filter((m) => m.role === "user" || m.role === "assistant");
        }

        const trimmed = messages.slice(-limit).map(truncateContent);

        return {
          session_id: sessionId,
          title: session.title,
          messages: trimmed,
          count: trimmed.length,
          total: messages.length,
        };
      },
    },

    {
      name: "sessions_send",
      definition: {
        type: "function",
        function: {
          name: "sessions_send",
          description: "Send a message to another session. Optionally wait for the AI to respond to it.",
          parameters: {
            type: "object",
            properties: {
              session_id: { type: "string", description: "Target session ID" },
              message: { type: "string", description: "Message to inject" },
              wait: { type: "boolean", description: "Wait for AI reply (default false)" },
            },
            required: ["session_id", "message"],
          },
        },
      },
      execute: async (args) => {
        const sessionId = args.session_id as string;
        const message = args.message as string;
        const wait = (args.wait as boolean) ?? false;

        if (!message?.trim()) return { error: "Message cannot be empty" };

        await chatService.getOrCreate(sessionId, { systemPrompt: defaultSessionPrompt });
        await chatService.addUserMessage(sessionId, message);

        if (!wait) {
          return { sent: true, session_id: sessionId };
        }

        try {
          let messages = await chatService.buildApiMessages(sessionId);
          if (messages.length > 0 && messages[0]?.role === "system") {
            messages[0] = { role: "system", content: defaultSessionPrompt };
          } else {
            messages = [{ role: "system", content: defaultSessionPrompt }, ...messages];
          }
          const response = await callLLM(messages, registry.definitions, false);

          let replyText: string;
          if (response instanceof Response) {
            const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
            replyText = json.choices?.[0]?.message?.content ?? "No response generated.";
          } else {
            replyText = response.content ?? "No response generated.";
          }

          await chatService.addAssistantMessage(sessionId, replyText);

          return {
            sent: true,
            session_id: sessionId,
            reply: replyText.length > MAX_CONTENT_LENGTH ? replyText.slice(0, MAX_CONTENT_LENGTH) + "…" : replyText,
          };
        } catch (err) {
          return { sent: true, session_id: sessionId, error: `Failed to get reply: ${(err as Error).message}` };
        }
      },
    },

    {
      name: "sessions_spawn",
      definition: {
        type: "function",
        function: {
          name: "sessions_spawn",
          description: "Spawn a new agent run (sub-task). Creates a new run that executes the given instruction autonomously in the background.",
          parameters: {
            type: "object",
            properties: {
              instruction: { type: "string", description: "Task instruction for the sub-agent" },
              agent_id: { type: "string", description: "Agent ID to use (default: 'default')" },
              label: { type: "string", description: "Optional label for the run" },
            },
            required: ["instruction"],
          },
        },
      },
      execute: async (args) => {
        const instruction = args.instruction as string;
        const agentId = (args.agent_id as string) ?? "default";

        if (!instruction?.trim()) return { error: "Instruction cannot be empty" };

        try {
          const run = runManager.create({
            userId: "session-spawn",
            agentId,
            instruction,
          });

          const { executeRun } = await import("../services/run-executor.js");
          executeRun(run.id, instruction, {
            chatService,
            runManager,
            eventBus,
            registry,
            callLLM,
            maxIterations: 25,
          }).catch(() => {});

          return {
            spawned: true,
            run_id: run.id,
            agent_id: agentId,
            status: "started",
          };
        } catch (err) {
          return { error: `Failed to spawn run: ${(err as Error).message}` };
        }
      },
    },

    {
      name: "session_status",
      definition: {
        type: "function",
        function: {
          name: "session_status",
          description: "Get metadata and metrics for a specific session.",
          parameters: {
            type: "object",
            properties: {
              session_id: { type: "string", description: "Session ID" },
            },
            required: ["session_id"],
          },
        },
      },
      execute: async (args) => {
        const sessionId = args.session_id as string;
        const session = await chatService.loadSession(sessionId);
        if (!session) return { error: `Session not found: ${sessionId}` };

        const nonSystemMessages = session.messages.filter((m) => m.role !== "system");
        const userMessages = nonSystemMessages.filter((m) => m.role === "user").length;
        const assistantMessages = nonSystemMessages.filter((m) => m.role === "assistant").length;
        const toolMessages = nonSystemMessages.filter((m) => m.role === "tool").length;

        return {
          id: session.id,
          title: session.title,
          agentId: session.agentId,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: nonSystemMessages.length,
          breakdown: { user: userMessages, assistant: assistantMessages, tool: toolMessages },
        };
      },
    },
  ];
}
