import type { EventBus } from "@undoable/core";
import type { EventType } from "@undoable/shared";
import { readSseStream } from "@undoable/llm-sdk";
import type { ChatService, ToolCall } from "./chat-service.js";
import type { RunManager } from "./run-manager.js";
import type { ProviderService } from "./provider-service.js";
import { truncateToolResult } from "./web-utils.js";
import type { ToolRegistry } from "../tools/index.js";
import {
  type ThinkingConfig,
  DEFAULT_THINKING_CONFIG,
  splitThinkingTags,
  extractThinkingFromStream,
  stripThinkingTags,
} from "./thinking.js";

const MAX_TOOL_RESULT_CHARS = 30_000;
const DEFAULT_MAX_ITERATIONS = 25;

export type RunExecutorDeps = {
  chatService: ChatService;
  runManager: RunManager;
  eventBus: EventBus;
  registry: ToolRegistry;
  providerService?: ProviderService;
  callLLM: CallLLMFn;
  maxIterations?: number;
  thinkingConfig?: ThinkingConfig;
  /** Optional system prompt override (e.g. for scheduled jobs). */
  systemPrompt?: string;
  /** Persistent session ID. When provided, the run reuses this session across executions (e.g. cron-{jobId}). */
  sessionId?: string;
};

export type CallLLMFn = (
  messages: unknown[],
  toolDefs: unknown[],
  stream: boolean,
) => Promise<Response | { content: string | null; tool_calls?: ToolCall[] }>;

type StreamDelta = {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string;
  }>;
};

/**
 * Executes a run's instruction through the LLM loop with tool calling.
 * Emits events through EventBus so the SSE endpoint can stream them to the UI.
 */
export async function executeRun(
  runId: string,
  instruction: string,
  deps: RunExecutorDeps,
): Promise<void> {
  const {
    chatService, runManager, eventBus, registry,
    providerService, callLLM, thinkingConfig = { ...DEFAULT_THINKING_CONFIG },
  } = deps;
  const maxIterations = deps.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  const emit = (type: EventType, payload: Record<string, unknown> = {}) => {
    eventBus.emit(runId, type, payload, "system");
  };

  const useTagReasoning = () => {
    if (providerService) return providerService.modelUsesTagReasoning();
    return false;
  };

  const sessionId = deps.sessionId ?? `run-${runId}`;
  if (deps.systemPrompt) {
    await chatService.getOrCreate(sessionId, { systemPrompt: deps.systemPrompt });
  }
  await chatService.addUserMessage(sessionId, instruction);

  runManager.updateStatus(runId, "planning", "system");
  emit("STATUS_CHANGED", { status: "planning" });
  emit("PHASE_STARTED", { phase: "execution", instruction, maxIterations });

  try {
    let loops = 0;
    while (loops < maxIterations) {
      loops++;
      emit("ACTION_PROGRESS", { iteration: loops, maxIterations });

      const messages = await chatService.buildApiMessages(sessionId);
      const res = await callLLM(messages, registry.definitions, true) as Response;

      const reader = res.body?.getReader();
      if (!reader) {
        emit("RUN_FAILED", { content: "No response body from LLM" });
        break;
      }

      let fullContent = "";
      const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();
      let hasToolCalls = false;
      let lastThinkingEmitted = "";

      for await (const line of readSseStream(reader)) {
        if (line.data === "[DONE]") break;
        try {
          const parsed = JSON.parse(line.data) as StreamDelta;
          const choice = parsed.choices?.[0];
          const delta = choice?.delta;

          if (delta?.content) {
            fullContent += delta.content;

            if (useTagReasoning() && thinkingConfig.visibility === "stream") {
              const thinking = extractThinkingFromStream(fullContent);
              if (thinking && thinking !== lastThinkingEmitted) {
                const newThinking = thinking.slice(lastThinkingEmitted.length);
                if (newThinking) emit("LLM_THINKING", { content: newThinking, streaming: true });
                lastThinkingEmitted = thinking;
              }
              const visible = stripThinkingTags(fullContent);
              const prevVisible = stripThinkingTags(fullContent.slice(0, -delta.content.length));
              const visibleDelta = visible.slice(prevVisible.length);
              if (visibleDelta) emit("LLM_TOKEN", { content: visibleDelta });
            } else {
              emit("LLM_TOKEN", { content: delta.content });
            }
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

      // Handle thinking blocks in final content
      let visibleContent = fullContent;
      if (useTagReasoning()) {
        const blocks = splitThinkingTags(fullContent);
        if (blocks) {
          const thinkingText = blocks.filter((b) => b.type === "thinking").map((b) => b.content).join("\n");
          visibleContent = blocks.filter((b) => b.type === "text").map((b) => b.content).join("\n").trim();
          if (thinkingText && thinkingConfig.visibility !== "off" && thinkingConfig.visibility !== "stream") {
            emit("LLM_THINKING", { content: thinkingText });
          }
        }
      }

      if (!hasToolCalls) {
        await chatService.addAssistantMessage(sessionId, visibleContent);
        emit("RUN_COMPLETED", { content: visibleContent, iterations: loops, maxIterations });
        runManager.updateStatus(runId, "completed", "system");
        emit("STATUS_CHANGED", { status: "completed" });
        return;
      }

      // Process tool calls
      runManager.updateStatus(runId, "applying", "system");
      emit("STATUS_CHANGED", { status: "applying" });

      const toolCalls: ToolCall[] = Array.from(pendingToolCalls.values()).map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.args },
      }));

      await chatService.addAssistantToolCalls(sessionId, toolCalls);

      for (const tc of toolCalls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { }
        emit("TOOL_CALL", { name: tc.function.name, args, iteration: loops, maxIterations });

        try {
          const result = await registry.execute(tc.function.name, args);
          const resultStr = truncateToolResult(JSON.stringify(result), MAX_TOOL_RESULT_CHARS);
          await chatService.addToolResult(sessionId, tc.id, resultStr);
          emit("TOOL_RESULT", { name: tc.function.name, result });
        } catch (err) {
          const errStr = String(err);
          await chatService.addToolResult(sessionId, tc.id, JSON.stringify({ error: errStr }));
          emit("TOOL_RESULT", { name: tc.function.name, result: { error: errStr } });
        }
      }

      runManager.updateStatus(runId, "planning", "system");
      emit("STATUS_CHANGED", { status: "planning" });
    }

    if (loops >= maxIterations) {
      emit("RUN_WARNING", {
        content: `Run reached maximum iterations (${maxIterations}).`,
        maxIterations,
      });
      runManager.updateStatus(runId, "completed", "system");
      emit("STATUS_CHANGED", { status: "completed" });
    }
  } catch (err) {
    emit("RUN_FAILED", { content: String(err) });
    runManager.updateStatus(runId, "failed", "system");
    emit("STATUS_CHANGED", { status: "failed" });
  }
}
