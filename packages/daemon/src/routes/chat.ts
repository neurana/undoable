import type { FastifyInstance } from "fastify";
import type { ChatService } from "../services/chat-service.js";
import type { ToolCall } from "../services/chat-service.js";
import type { RunManager } from "../services/run-manager.js";
import type { SchedulerService } from "@undoable/core";
import { readSseStream } from "@undoable/llm-sdk";
import type { BrowserService } from "../services/browser-service.js";
import { truncateToolResult } from "../services/web-utils.js";
import { createToolRegistry } from "../tools/index.js";
import { resolveRunMode, shouldAutoApprove, type RunModeConfig } from "../actions/index.js";
import { DriftDetector, buildStabilizer } from "../alignment/index.js";
import { parseAttachments, type ChatAttachment } from "../services/chat-attachments.js";

const MAX_TOOL_RESULT_CHARS = 30_000;
const DEFAULT_MAX_ITERATIONS = 10;

export type ChatRouteConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  runMode?: RunModeConfig;
};

type StreamDelta = {
  choices?: Array<{
    delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string;
  }>;
};

async function callLLM(
  config: ChatRouteConfig,
  messages: unknown[],
  toolDefs: unknown[],
  stream: false,
): Promise<{ content: string | null; tool_calls?: ToolCall[] }>;
async function callLLM(
  config: ChatRouteConfig,
  messages: unknown[],
  toolDefs: unknown[],
  stream: true,
): Promise<Response>;
async function callLLM(
  config: ChatRouteConfig,
  messages: unknown[],
  toolDefs: unknown[],
  stream: boolean,
) {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      stream,
      messages,
      tools: toolDefs,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`LLM API error: ${res.status} ${errText}`);
  }
  if (!stream) {
    const data = await res.json() as { choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }> };
    return data.choices[0]!.message;
  }
  return res;
}

export function chatRoutes(
  app: FastifyInstance,
  chatService: ChatService,
  config: ChatRouteConfig,
  runManager: RunManager,
  scheduler: SchedulerService,
  browserSvc: BrowserService,
  skillsService?: { getPrompt(): string },
) {
  let runModeConfig = config.runMode ?? resolveRunMode();
  const approvalMode = shouldAutoApprove(runModeConfig) ? "off" as const : undefined;
  const registry = createToolRegistry({ runManager, scheduler, browserSvc, approvalMode });
  let maxIterations = runModeConfig.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  const driftDetector = new DriftDetector();
  let activeSse: ((data: unknown) => void) | null = null;

  registry.approvalGate.onPending((approval) => {
    activeSse?.({
      type: "approval_pending",
      id: approval.id,
      tool: approval.toolName,
      description: approval.description,
      args: approval.args,
    });
  });

  app.post<{ Body: { id: string; approved: boolean } }>("/chat/approve", async (req, reply) => {
    const { id, approved } = req.body;
    if (!id) return reply.code(400).send({ error: "id is required" });
    const resolved = registry.approvalGate.resolve(id, approved);
    if (!resolved) return reply.code(404).send({ error: "Approval not found or already resolved" });
    return { ok: true, id, approved };
  });

  app.get("/chat/approval-mode", async () => {
    return { mode: registry.approvalGate.getMode() };
  });

  app.post<{ Body: { mode: string } }>("/chat/approval-mode", async (req, reply) => {
    const { mode } = req.body;
    if (!["off", "mutate", "always"].includes(mode)) {
      return reply.code(400).send({ error: "mode must be off, mutate, or always" });
    }
    registry.approvalGate.setMode(mode as "off" | "mutate" | "always");
    return { ok: true, mode };
  });

  app.get("/chat/run-config", async () => {
    return { mode: runModeConfig.mode, maxIterations, approvalMode: registry.approvalGate.getMode() };
  });

  app.post<{ Body: { mode?: string; maxIterations?: number } }>("/chat/run-config", async (req, reply) => {
    const { mode, maxIterations: newMax } = req.body;
    if (mode !== undefined) {
      if (!["interactive", "autonomous", "supervised"].includes(mode)) {
        return reply.code(400).send({ error: "mode must be interactive, autonomous, or supervised" });
      }
      const newConfig = resolveRunMode({ mode: mode as "interactive" | "autonomous" | "supervised", maxIterations: newMax ?? maxIterations });
      runModeConfig = newConfig;
      maxIterations = newConfig.maxIterations;
      if (shouldAutoApprove(newConfig)) {
        registry.approvalGate.setMode("off");
      }
    }
    if (newMax !== undefined && newMax > 0) {
      maxIterations = newMax;
    }
    return { ok: true, mode: runModeConfig.mode, maxIterations, approvalMode: registry.approvalGate.getMode() };
  });

  app.post<{ Body: { action: string; id?: string; count?: number } }>("/chat/undo", async (req, reply) => {
    const { action, id, count } = req.body;
    switch (action) {
      case "list":
        return { actions: registry.undoService.listUndoable().map((a) => ({ id: a.id, tool: a.toolName, args: a.args, startedAt: a.startedAt })) };
      case "one":
        if (!id) return reply.code(400).send({ error: "id required" });
        return registry.undoService.undoAction(id);
      case "last":
        return { results: await registry.undoService.undoLastN(count ?? 1) };
      case "all":
        return { results: await registry.undoService.undoAll() };
      default:
        return reply.code(400).send({ error: `Unknown action: ${action}` });
    }
  });

  app.get("/chat/actions", async () => {
    const records = registry.actionLog.list();
    const recent = records.slice(-50);
    return {
      total: records.length,
      mode: registry.approvalGate.getMode(),
      runMode: runModeConfig.mode,
      maxIterations,
      actions: recent.map((r) => ({
        id: r.id, tool: r.toolName, category: r.category,
        approval: r.approval, undoable: r.undoable,
        startedAt: r.startedAt, durationMs: r.durationMs, error: r.error ?? null,
      })),
    };
  });

  app.post<{ Body: { message: string; sessionId?: string; attachments?: ChatAttachment[] } }>("/chat", async (req, reply) => {
    const { message, sessionId = "default", attachments } = req.body;
    if (!message?.trim() && (!attachments || attachments.length === 0)) {
      return reply.code(400).send({ error: "message or attachments required" });
    }

    if (attachments && attachments.length > 0) {
      const parsed = parseAttachments(attachments);
      await chatService.addUserMessageWithImages(sessionId, message ?? "", parsed.images, parsed.textBlocks);
    } else {
      await chatService.addUserMessage(sessionId, message);
    }

    const session = await chatService.getOrCreate(sessionId);
    const turnIndex = session.messages.filter((m) => m.role === "user").length;
    const driftScore = driftDetector.analyze(sessionId, message, turnIndex);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sse = (data: unknown) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    activeSse = sse;

    sse({ type: "session_info", mode: runModeConfig.mode, maxIterations, approvalMode: registry.approvalGate.getMode() });

    if (driftScore.exceeds) {
      const reinforcement = buildStabilizer(driftScore);
      if (reinforcement) {
        await chatService.injectSystemMessage(sessionId, reinforcement);
        driftDetector.recordReinforcement(sessionId);
        sse({ type: "alignment", score: driftScore.total, domain: driftScore.domain, signals: driftScore.signals.map((s) => s.category) });
      }
    }

    try {
      let loops = 0;
      while (loops < maxIterations) {
        loops++;
        sse({ type: "progress", iteration: loops, maxIterations });
        const messages = await chatService.buildApiMessages(sessionId);
        const skillsPrompt = skillsService?.getPrompt();
        if (skillsPrompt && messages.length > 0 && messages[0]?.role === "system") {
          const sys = messages[0] as { role: "system"; content: string };
          messages[0] = { role: "system" as const, content: sys.content + "\n\n" + skillsPrompt };
        }
        const res = await callLLM(config, messages, registry.definitions, true) as Response;

        const reader = res.body?.getReader();
        if (!reader) { sse({ type: "error", content: "No response body" }); break; }

        let fullContent = "";
        const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();
        let hasToolCalls = false;

        for await (const line of readSseStream(reader)) {
          if (line.data === "[DONE]") break;
          try {
            const parsed = JSON.parse(line.data) as StreamDelta;
            const choice = parsed.choices?.[0];
            const delta = choice?.delta;

            if (delta?.content) {
              fullContent += delta.content;
              sse({ type: "token", content: delta.content });
            }

            if (delta?.tool_calls) {
              hasToolCalls = true;
              for (const tc of delta.tool_calls) {
                let entry = pendingToolCalls.get(tc.index);
                if (!entry) {
                  entry = { id: tc.id ?? "", name: "", args: "" };
                  pendingToolCalls.set(tc.index, entry);
                }
                if (tc.id) entry.id = tc.id;
                if (tc.function?.name) entry.name += tc.function.name;
                if (tc.function?.arguments) entry.args += tc.function.arguments;
              }
            }
          } catch { continue; }
        }

        if (!hasToolCalls) {
          await chatService.addAssistantMessage(sessionId, fullContent);
          sse({ type: "done", content: fullContent, iterations: loops, maxIterations });
          break;
        }

        const toolCalls: ToolCall[] = Array.from(pendingToolCalls.values()).map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.args },
        }));

        await chatService.addAssistantToolCalls(sessionId, toolCalls);

        const isOnlyProcessPoll = toolCalls.every((tc) => {
          if (tc.function.name !== "process") return false;
          try { const a = JSON.parse(tc.function.arguments); return a.action === "poll"; } catch { return false; }
        });
        if (isOnlyProcessPoll) loops--;

        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { }
          sse({ type: "tool_call", name: tc.function.name, args, iteration: loops, maxIterations });

          try {
            const result = await registry.execute(tc.function.name, args);
            const resultStr = truncateToolResult(JSON.stringify(result), MAX_TOOL_RESULT_CHARS);
            await chatService.addToolResult(sessionId, tc.id, resultStr);
            sse({ type: "tool_result", name: tc.function.name, result });
          } catch (err) {
            const errStr = String(err);
            await chatService.addToolResult(sessionId, tc.id, JSON.stringify({ error: errStr }));
            sse({ type: "tool_result", name: tc.function.name, result: { error: errStr } });
          }
        }
      }
      if (loops >= maxIterations) {
        sse({
          type: "warning",
          content: `Tool loop reached maximum iterations (${maxIterations}). Increase maxIterations or use autonomous mode for longer chains.`,
          mode: runModeConfig.mode,
          maxIterations,
        });
      }
    } catch (err) {
      sse({ type: "error", content: String(err) });
    }

    activeSse = null;
    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
  });

  app.get<{ Querystring: { sessionId?: string } }>("/chat/history", async (req) => {
    const sessionId = req.query.sessionId ?? "default";
    return chatService.getHistory(sessionId);
  });

  app.get("/chat/sessions", async () => {
    return chatService.listSessions();
  });

  app.post<{ Body: { title?: string } }>("/chat/sessions", async (req) => {
    const session = await chatService.createSession(req.body.title);
    return { id: session.id, title: session.title, createdAt: session.createdAt };
  });

  app.get<{ Params: { id: string } }>("/chat/sessions/:id", async (req, reply) => {
    const session = await chatService.loadSession(req.params.id);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    const history = session.messages.filter((m) => m.role !== "system");
    return { id: session.id, title: session.title, createdAt: session.createdAt, updatedAt: session.updatedAt, messages: history };
  });

  app.delete<{ Params: { id: string } }>("/chat/sessions/:id", async (req, reply) => {
    const deleted = await chatService.deleteSession(req.params.id);
    if (!deleted) return reply.code(404).send({ error: "Session not found" });
    return { deleted: true };
  });

  app.patch<{ Params: { id: string }; Body: { title: string } }>("/chat/sessions/:id", async (req, reply) => {
    const renamed = await chatService.renameSession(req.params.id, req.body.title);
    if (!renamed) return reply.code(404).send({ error: "Session not found" });
    return { ok: true };
  });
}
