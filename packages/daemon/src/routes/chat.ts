import os from "node:os";
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
import type { ProviderService } from "../services/provider-service.js";
import { buildSystemPrompt } from "../services/system-prompt-builder.js";
import { needsCompaction, compactMessages } from "../services/context-window.js";
import { filterToolsByPolicy } from "../services/tool-policy.js";
import { loadContextFiles } from "../services/context-files.js";
import { OnboardingService } from "../services/onboarding-service.js";
import { createSubagentTools } from "../tools/subagent-tools.js";
import type { HeartbeatService } from "../services/heartbeat-service.js";
import type { SwarmService } from "../services/swarm-service.js";
import {
  type EconomyModeInput,
  type EconomyModeConfig,
  resolveEconomyMode,
  effectiveMaxIterations,
  effectiveToolResultLimit,
  effectiveCanThink,
} from "../services/economy-mode.js";
import {
  type ThinkLevel,
  type ReasoningVisibility,
  type ThinkingConfig,
  DEFAULT_THINKING_CONFIG,
  supportsReasoningEffort,
  isTagReasoningProvider,
  mapToReasoningEffort,
  normalizeThinkLevel,
  splitThinkingTags,
  extractThinkingFromStream,
  stripThinkingTags,
} from "../services/thinking.js";
import { parseDirectives, DIRECTIVE_HELP } from "../services/directive-parser.js";
import type { TtsService } from "../services/tts-service.js";
import type { SttService } from "../services/stt-service.js";
import type { SkillsService } from "../services/skills-service.js";

const MAX_TOOL_RESULT_CHARS = 30_000;
const DEFAULT_MAX_ITERATIONS = 10;

function isRetryableError(status: number): boolean {
  return status === 429 || status >= 500;
}

class LLMApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`LLM API error: ${status} ${body}`);
    this.name = "LLMApiError";
  }
  get retryable(): boolean {
    return isRetryableError(this.status);
  }
}

type ChatFailure = {
  message: string;
  recovery?: string;
  status?: number;
};

function describeChatFailure(err: unknown): ChatFailure {
  if (err instanceof LLMApiError) {
    if (err.status === 401 || err.status === 403) {
      return {
        message: "Model provider authentication failed.",
        recovery: "Update your provider API key in settings, then retry.",
        status: err.status,
      };
    }
    if (err.status === 429) {
      return {
        message: "Model provider rate limited the request.",
        recovery: "Wait a few seconds and retry.",
        status: err.status,
      };
    }
    if (err.status >= 500) {
      return {
        message: "Model provider is temporarily unavailable.",
        recovery: "Retry shortly or switch to another model/provider.",
        status: err.status,
      };
    }
    return {
      message: `Model request failed (${err.status}).`,
      recovery: "Check provider settings and model availability, then retry.",
      status: err.status,
    };
  }

  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);

  if (name === "AbortError") {
    return {
      message: "Request timed out.",
      recovery: "Retry with a shorter prompt or fewer attachments.",
    };
  }

  if (/No STT provider configured/i.test(message)) {
    return {
      message,
      recovery: "Configure an STT provider key in settings and retry.",
    };
  }

  return { message: message || "Unknown error" };
}

type ActiveChatRun = {
  controller: AbortController;
  sessionId: string;
  startedAtMs: number;
};

const activeChatRuns = new Map<string, ActiveChatRun>();
let chatRunCounter = 0;
let sessionCounter = 0;

function generateRunId(): string {
  return `run-${Date.now()}-${++chatRunCounter}`;
}

function generateSessionId(): string {
  return `chat-${Date.now()}-${++sessionCounter}`;
}

export type ChatRouteConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  provider?: string;
  runMode?: RunModeConfig;
  thinking?: ThinkingConfig;
  economy?: EconomyModeInput;
};

type StreamDelta = {
  choices?: Array<{
    delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

type UsageAccumulator = { promptTokens: number; completionTokens: number; totalTokens: number };

export async function callLLM(
  config: ChatRouteConfig,
  messages: unknown[],
  toolDefs: unknown[],
  stream: false,
  thinkLevel?: ThinkLevel,
  abortSignal?: AbortSignal,
): Promise<{ content: string | null; tool_calls?: ToolCall[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }>;
export async function callLLM(
  config: ChatRouteConfig,
  messages: unknown[],
  toolDefs: unknown[],
  stream: true,
  thinkLevel?: ThinkLevel,
  abortSignal?: AbortSignal,
): Promise<Response>;
export async function callLLM(
  config: ChatRouteConfig,
  messages: unknown[],
  toolDefs: unknown[],
  stream: boolean,
  thinkLevel?: ThinkLevel,
  abortSignal?: AbortSignal,
): Promise<{ content: string | null; tool_calls?: ToolCall[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } | Response> {
  const body: Record<string, unknown> = {
    model: config.model,
    stream,
    messages,
    tools: toolDefs,
  };

  // Add reasoning_effort for models that support it (OpenAI o-series)
  if (thinkLevel && thinkLevel !== "off" && supportsReasoningEffort(config.model)) {
    body.reasoning_effort = mapToReasoningEffort(thinkLevel);
  }

  if (stream) {
    body.stream_options = { include_usage: true };
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
    signal: abortSignal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new LLMApiError(res.status, errText);
  }
  if (!stream) {
    const data = await res.json() as { choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
    return { ...data.choices[0]!.message, usage: data.usage };
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
  skillsService?: SkillsService,
  providerService?: ProviderService,
  agentRegistry?: import("@undoable/core").AgentRegistry,
  instructionsStore?: import("../services/instructions-store.js").InstructionsStore,
  memoryService?: import("../services/memory-service.js").MemoryService,
  sandboxExec?: import("../services/sandbox-exec.js").SandboxExecService,
  heartbeatService?: HeartbeatService,
  swarmService?: SwarmService,
  usageService?: import("../services/usage-service.js").UsageService,
  ttsService?: TtsService,
  sttService?: SttService,
) {
  let runModeConfig = config.runMode ?? resolveRunMode();
  let economyMode: EconomyModeConfig = resolveEconomyMode(config.economy);
  const approvalMode = shouldAutoApprove(runModeConfig) ? "off" as const : undefined;
  const registry = createToolRegistry({
    runManager,
    scheduler,
    browserSvc,
    memoryService: memoryService ?? undefined,
    swarmService: swarmService ?? undefined,
    sandboxExec: sandboxExec ?? undefined,
    approvalMode,
    skillsService: skillsService ?? undefined,
  });
  let configuredMaxIterations = runModeConfig.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  let priorThinkingBeforeEconomy: ThinkLevel | null = null;
  if (economyMode.enabled) {
    priorThinkingBeforeEconomy = DEFAULT_THINKING_CONFIG.level;
  }

  if (agentRegistry) {
    const boundCallLLM = (msgs: unknown[], defs: unknown[], stream: boolean) => {
      const conf = providerService ? { ...config, ...providerService.getActiveConfig() } : config;
      return callLLM(conf, msgs, defs, stream as false);
    };
    registry.registerTools(createSubagentTools({
      agentRegistry,
      callLLM: boundCallLLM,
      toolExecute: registry.execute,
      toolDefs: registry.definitions,
      maxIterations: 5,
    }));
  }
  let thinkingConfig: ThinkingConfig = config.thinking ?? { ...DEFAULT_THINKING_CONFIG };
  if (economyMode.enabled) {
    priorThinkingBeforeEconomy = thinkingConfig.level;
    thinkingConfig.level = "off";
    if (thinkingConfig.visibility !== "off") thinkingConfig.visibility = "off";
  }

  const getActiveConfig = () => {
    if (providerService) return providerService.getActiveConfig();
    return { apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model, provider: config.provider ?? "" };
  };
  const useTagReasoning = () => {
    if (providerService) return providerService.modelUsesTagReasoning();
    return isTagReasoningProvider(config.provider ?? "");
  };
  const canThink = () => {
    if (providerService) return providerService.modelSupportsThinking();
    return supportsReasoningEffort(getActiveConfig().model);
  };
  const canThinkNow = () => effectiveCanThink(canThink(), economyMode);
  const getMaxIterationsForRun = () =>
    effectiveMaxIterations(configuredMaxIterations, economyMode);
  const getToolResultLimit = () =>
    effectiveToolResultLimit(MAX_TOOL_RESULT_CHARS, economyMode);
  const setEconomyMode = (enabled: boolean) => {
    if (enabled === economyMode.enabled) return;
    economyMode = resolveEconomyMode({ ...economyMode, enabled });
    if (enabled) {
      priorThinkingBeforeEconomy = thinkingConfig.level;
      thinkingConfig.level = "off";
      if (thinkingConfig.visibility !== "off") thinkingConfig.visibility = "off";
      return;
    }
    if (priorThinkingBeforeEconomy !== null && thinkingConfig.level === "off") {
      thinkingConfig.level = priorThinkingBeforeEconomy;
      if (thinkingConfig.level !== "off" && thinkingConfig.visibility === "off") {
        thinkingConfig.visibility = "stream";
      }
    }
    priorThinkingBeforeEconomy = null;
  };
  const shouldDisableStreaming = (model: string) => {
    if (providerService) return providerService.shouldDisableStreaming(model);
    return false;
  };
  const syncOpenAIVoiceKeys = () => {
    if (!providerService) return;
    const openaiConfig = providerService.getProviderConfig("openai");
    if (!openaiConfig) return;
    const apiKey = openaiConfig.apiKey ?? "";
    const baseUrl = openaiConfig.baseUrl || "https://api.openai.com/v1";
    if (ttsService) {
      ttsService.setApiKey("openai", apiKey);
      ttsService.setBaseUrl("openai", baseUrl);
    }
    if (sttService) {
      sttService.setApiKey("openai", apiKey);
      sttService.setBaseUrl("openai", baseUrl);
    }
  };

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

  app.post<{ Body: { id: string; approved: boolean; allowAlways?: boolean } }>("/chat/approve", async (req, reply) => {
    const { id, approved, allowAlways } = req.body;
    if (!id) return reply.code(400).send({ error: "id is required" });

    if (approved && allowAlways) {
      const pending = registry.approvalGate.getApproval(id);
      if (pending) {
        registry.approvalGate.addAutoApprovePattern(pending.toolName);
      }
    }

    const resolved = registry.approvalGate.resolve(id, approved);
    if (!resolved) return reply.code(404).send({ error: "Approval not found or already resolved" });
    return { ok: true, id, approved };
  });

  app.get("/chat/approval-mode", async () => {
    return {
      mode: registry.approvalGate.getMode(),
      dangerouslySkipPermissions: runModeConfig.dangerouslySkipPermissions,
    };
  });

  app.post<{ Body: { mode: string } }>("/chat/approval-mode", async (req, reply) => {
    const { mode } = req.body;
    if (!["off", "mutate", "always"].includes(mode)) {
      return reply.code(400).send({ error: "mode must be off, mutate, or always" });
    }
    if (runModeConfig.dangerouslySkipPermissions && mode !== "off") {
      return reply.code(409).send({
        error: "approval mode is locked to off while --dangerously-skip-permissions is active",
      });
    }
    registry.approvalGate.setMode(mode as "off" | "mutate" | "always");
    return {
      ok: true,
      mode: registry.approvalGate.getMode(),
      dangerouslySkipPermissions: runModeConfig.dangerouslySkipPermissions,
    };
  });

  app.get("/chat/agents", async () => {
    if (!agentRegistry) return { agents: [], defaultId: null };
    const agents = agentRegistry.list().map((a) => ({ id: a.id, name: a.name ?? a.id, model: a.model, identity: a.identity }));
    let defaultId: string | null = null;
    try { defaultId = agentRegistry.getDefaultId(); } catch { /* none */ }
    return { agents, defaultId };
  });

  const buildRunConfigResponse = () => {
    const active = getActiveConfig();
    return {
      mode: runModeConfig.mode,
      maxIterations: getMaxIterationsForRun(),
      configuredMaxIterations,
      approvalMode: registry.approvalGate.getMode(),
      dangerouslySkipPermissions: runModeConfig.dangerouslySkipPermissions,
      thinking: thinkingConfig.level,
      reasoningVisibility: thinkingConfig.visibility,
      model: active.model,
      provider: active.provider,
      canThink: canThinkNow(),
      economyMode: economyMode.enabled,
      economy: {
        maxIterationsCap: economyMode.maxIterationsCap,
        toolResultMaxChars: economyMode.toolResultMaxChars,
        contextMaxTokens: economyMode.compaction.maxTokens,
        contextThreshold: economyMode.compaction.threshold,
      },
    };
  };

  app.get("/chat/run-config", async () => {
    return buildRunConfigResponse();
  });

  app.post<{ Body: { mode?: string; maxIterations?: number; economyMode?: boolean } }>("/chat/run-config", async (req, reply) => {
    const { mode, maxIterations: newMax, economyMode: nextEconomyMode } = req.body;
    const nextMaxIterations =
      newMax === undefined
        ? undefined
        : Number.isFinite(newMax) && newMax > 0
          ? Math.floor(newMax)
          : null;
    if (newMax !== undefined && nextMaxIterations === null) {
      return reply.code(400).send({ error: "maxIterations must be a positive number" });
    }
    if (mode !== undefined) {
      if (!["interactive", "autonomous", "supervised"].includes(mode)) {
        return reply.code(400).send({ error: "mode must be interactive, autonomous, or supervised" });
      }
      const newConfig = resolveRunMode({
        mode: mode as "interactive" | "autonomous" | "supervised",
        maxIterations: nextMaxIterations ?? configuredMaxIterations,
        dangerouslySkipPermissions: runModeConfig.dangerouslySkipPermissions,
      });
      runModeConfig = newConfig;
      configuredMaxIterations = newConfig.maxIterations;
      if (shouldAutoApprove(newConfig)) {
        registry.approvalGate.setMode("off");
      }
    }
    if (typeof nextMaxIterations === "number") {
      configuredMaxIterations = nextMaxIterations;
      runModeConfig = {
        ...runModeConfig,
        maxIterations: configuredMaxIterations,
      };
    }
    if (typeof nextEconomyMode === "boolean") {
      setEconomyMode(nextEconomyMode);
    }
    return {
      ok: true,
      ...buildRunConfigResponse(),
    };
  });

  app.get("/chat/thinking", async () => {
    return {
      level: thinkingConfig.level,
      visibility: thinkingConfig.visibility,
      canThink: canThinkNow(),
      economyMode: economyMode.enabled,
    };
  });

  app.post<{ Body: { level?: string; visibility?: string } }>("/chat/thinking", async (req, reply) => {
    const { level, visibility } = req.body;
    if (level !== undefined) {
      const normalized = normalizeThinkLevel(level);
      if (!normalized) return reply.code(400).send({ error: "level must be off, low, medium, or high" });
      thinkingConfig.level = economyMode.enabled ? "off" : normalized;
    }
    if (visibility !== undefined) {
      if (!["off", "on", "stream"].includes(visibility)) {
        return reply.code(400).send({ error: "visibility must be off, on, or stream" });
      }
      thinkingConfig.visibility = visibility as ReasoningVisibility;
    }
    if (economyMode.enabled) {
      thinkingConfig.level = "off";
      if (thinkingConfig.visibility !== "off") thinkingConfig.visibility = "off";
    }
    return {
      ok: true,
      level: thinkingConfig.level,
      visibility: thinkingConfig.visibility,
      canThink: canThinkNow(),
      economyMode: economyMode.enabled,
    };
  });

  // ── Model & Provider endpoints ──

  app.get("/chat/model", async () => {
    if (providerService) {
      const active = providerService.getActive();
      return { provider: active.provider, model: active.model, name: active.name, capabilities: active.capabilities };
    }
    return { provider: config.provider ?? "openai", model: config.model, name: config.model, capabilities: { thinking: supportsReasoningEffort(config.model), tagReasoning: false, vision: false, tools: true } };
  });

  app.post<{ Body: { provider: string; model: string } }>("/chat/model", async (req, reply) => {
    if (!providerService) return reply.code(400).send({ error: "Provider service not available" });
    const { provider, model } = req.body;
    if (!provider || !model) return reply.code(400).send({ error: "provider and model required" });
    const result = await providerService.setActiveModel(provider, model);
    if (!result) return reply.code(400).send({ error: "Invalid provider/model or missing API key" });
    // Reset thinking if new model doesn't support it
    if (!result.capabilities.thinking && thinkingConfig.level !== "off") {
      thinkingConfig.level = "off";
    }
    return { ok: true, ...result };
  });

  app.get("/chat/models", async () => {
    if (!providerService) return { models: [] };
    return { models: providerService.listAllModels() };
  });

  app.get("/chat/providers", async () => {
    if (!providerService) return { providers: [] };
    return { providers: providerService.listProviders() };
  });

  app.post<{ Body: { provider: string; apiKey: string; baseUrl?: string } }>("/chat/providers", async (req, reply) => {
    if (!providerService) return reply.code(400).send({ error: "Provider service not available" });
    const { provider, apiKey, baseUrl } = req.body;
    if (!provider) return reply.code(400).send({ error: "provider required" });
    await providerService.setProviderKey(provider, apiKey, baseUrl);
    if (provider === "openai") {
      syncOpenAIVoiceKeys();
    }
    return { ok: true };
  });

  app.delete<{ Body: { provider: string } }>("/chat/providers", async (req, reply) => {
    if (!providerService) return reply.code(400).send({ error: "Provider service not available" });
    const { provider } = req.body;
    if (!provider) return reply.code(400).send({ error: "provider required" });
    await providerService.removeProviderKey(provider);
    if (provider === "openai") {
      syncOpenAIVoiceKeys();
    }
    return { ok: true };
  });

  app.get("/chat/local-servers", async () => {
    if (!providerService) return { servers: [] };
    return { servers: providerService.getLocalServers() };
  });

  app.post("/chat/local-models/refresh", async () => {
    if (!providerService) return { models: [] };
    await providerService.refreshLocalModels();
    return {
      models: providerService.listAllModels().filter((m) => m.local),
      servers: providerService.getLocalServers(),
    };
  });

  app.post<{ Body: { action: string; id?: string; count?: number } }>("/chat/undo", async (req, reply) => {
    const { action, id, count } = req.body;
    const toSummary = (items: ReturnType<typeof registry.undoService.listUndoable>) => items.map((a) => ({
      id: a.id,
      tool: a.toolName,
      args: a.args,
      startedAt: a.startedAt,
    }));
    switch (action) {
      case "list":
        return {
          undoable: toSummary(registry.undoService.listUndoable()),
          redoable: toSummary(registry.undoService.listRedoable()),
        };
      case "one":
      case "undo_one":
        if (!id) return reply.code(400).send({ error: "id required" });
        return { result: await registry.undoService.undoAction(id) };
      case "last":
      case "undo_last":
        return { results: await registry.undoService.undoLastN(count ?? 1) };
      case "all":
      case "undo_all":
        return { results: await registry.undoService.undoAll() };
      case "redo_one":
        if (!id) return reply.code(400).send({ error: "id required" });
        return { result: await registry.undoService.redoAction(id) };
      case "redo_last":
        return { results: await registry.undoService.redoLastN(count ?? 1) };
      case "redo_all":
        return { results: await registry.undoService.redoAll() };
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
      dangerouslySkipPermissions: runModeConfig.dangerouslySkipPermissions,
      maxIterations: getMaxIterationsForRun(),
      configuredMaxIterations,
      economyMode: economyMode.enabled,
      actions: recent.map((r) => ({
        id: r.id, tool: r.toolName, category: r.category,
        approval: r.approval, undoable: r.undoable,
        startedAt: r.startedAt, durationMs: r.durationMs, error: r.error ?? null,
      })),
    };
  });

  app.post<{ Body: { message: string; sessionId?: string; agentId?: string; model?: string; attachments?: ChatAttachment[] } }>("/chat", async (req, reply) => {
    const { message, agentId, model: requestModel, attachments } = req.body;
    // Create new session if no sessionId provided (or empty string)
    const sessionId = req.body.sessionId || generateSessionId();
    const isNewSession = !req.body.sessionId;
    if (!message?.trim() && (!attachments || attachments.length === 0)) {
      return reply.code(400).send({ error: "message or attachments required" });
    }

    let agentModelOverride: string | undefined;
    let agentFallbacks: string[] = [];
    let agentName: string | undefined;
    let agentInstructions: string | undefined;
    let agentWorkspace: string | undefined;
    let agentToolDefs = registry.definitions;

    // Per-request model override via body.model
    if (requestModel && providerService) {
      const resolved = providerService.resolveModelAlias(requestModel);
      if (resolved) {
        agentModelOverride = resolved.modelId;
      }
    }

    if (agentId && agentRegistry) {
      const agent = agentRegistry.get(agentId);
      if (agent?.model) agentModelOverride = agent.model;
      if (agent?.fallbacks?.length) agentFallbacks = agent.fallbacks;
      if (agent?.name) agentName = agent.name;
      if (agent?.workspace) agentWorkspace = agent.workspace;
      if (agent?.tools) agentToolDefs = filterToolsByPolicy(registry.definitions, agent.tools);
      if (instructionsStore) {
        agentInstructions = (await instructionsStore.getCurrent(agentId)) ?? undefined;
      }
    }

    // Parse inline directives from the message
    const { directives, cleanMessage } = parseDirectives(message ?? "");
    let directiveModelOverride: string | undefined;
    for (const d of directives) {
      if (d.type === "think") {
        thinkingConfig.level = d.level;
      } else if (d.type === "model" && providerService) {
        const resolved = providerService.resolveModelAlias(d.value);
        if (resolved) directiveModelOverride = resolved.modelId;
      }
    }
    if (directiveModelOverride) agentModelOverride = directiveModelOverride;

    const activeConf = getActiveConfig();
    const workspaceDir = agentWorkspace || os.homedir();
    const contextFiles = loadContextFiles(workspaceDir);
    const dynamicSystemPrompt = buildSystemPrompt({
      agentName,
      agentInstructions,
      skillsPrompt: skillsService?.getPrompt(),
      toolDefinitions: agentToolDefs,
      contextFiles,
      economyMode: economyMode.enabled,
      workspaceDir,
      runtime: {
        model: agentModelOverride ?? activeConf.model,
        provider: activeConf.provider,
        os: `${os.platform()} ${os.release()}`,
        arch: os.arch(),
        node: process.version,
      },
    });

    // Store the clean message (directives stripped) in chat history
    const messageToStore = cleanMessage || message;
    if (attachments && attachments.length > 0) {
      let parsed: ReturnType<typeof parseAttachments>;
      try {
        parsed = parseAttachments(attachments);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return reply.code(400).send({
          error: `Attachment validation failed: ${reason}`,
          code: "CHAT_ATTACHMENT_INVALID",
          recovery:
            "Use a smaller image/text file, verify the file is not corrupted, and retry.",
        });
      }
      await chatService.addUserMessageWithImages(
        sessionId,
        messageToStore ?? "",
        parsed.images,
        parsed.textBlocks,
      );
    } else {
      await chatService.addUserMessage(sessionId, messageToStore);
    }

    const session = await chatService.getOrCreate(sessionId, { systemPrompt: dynamicSystemPrompt, agentId });
    const turnIndex = session.messages.filter((m) => m.role === "user").length;
    const driftScore = driftDetector.analyze(sessionId, message, turnIndex);

    const runId = generateRunId();
    const abortController = new AbortController();
    activeChatRuns.set(runId, { controller: abortController, sessionId, startedAtMs: Date.now() });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sse = (data: unknown) => {
      if (abortController.signal.aborted) return;
      try { reply.raw.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* connection closed */ }
    };
    activeSse = sse;
    sse({ type: "run_start", runId });

    if (heartbeatService) {
      heartbeatService.register(sessionId, {
        agentId,
        onHeartbeat: () => {
          try { reply.raw.write(`: heartbeat\n\n`); } catch { /* connection closed */ }
        },
      });
    }

    sse({
      type: "session_info", sessionId: isNewSession ? sessionId : undefined,
      mode: runModeConfig.mode, maxIterations: getMaxIterationsForRun(), approvalMode: registry.approvalGate.getMode(),
      configuredMaxIterations,
      dangerouslySkipPermissions: runModeConfig.dangerouslySkipPermissions,
      economyMode: economyMode.enabled,
      thinking: thinkingConfig.level, reasoningVisibility: thinkingConfig.visibility,
      model: activeConf.model, provider: activeConf.provider, canThink: canThinkNow(),
    });

    // Handle directive-only messages (no LLM call needed)
    if (directives.length > 0 && !cleanMessage) {
      let handled = false;
      for (const d of directives) {
        if (d.type === "reset") {
          await chatService.resetSession(sessionId);
          sse({ type: "reset", sessionId });
          handled = true;
        } else if (d.type === "status") {
          const ac = getActiveConfig();
          sse({
            type: "status",
            model: ac.model,
            provider: ac.provider,
            thinking: thinkingConfig.level,
            visibility: thinkingConfig.visibility,
            mode: runModeConfig.mode,
            economyMode: economyMode.enabled,
            maxIterations: getMaxIterationsForRun(),
            configuredMaxIterations,
          });
          handled = true;
        } else if (d.type === "help") {
          sse({ type: "help", content: DIRECTIVE_HELP });
          handled = true;
        } else if (d.type === "think") {
          sse({ type: "directive_applied", directive: "think", level: d.level });
          handled = true;
        } else if (d.type === "model" && directiveModelOverride) {
          sse({ type: "directive_applied", directive: "model", model: directiveModelOverride });
          handled = true;
        }
      }
      if (handled) {
        sse({
          type: "done",
          content: "",
          iterations: 0,
          maxIterations: getMaxIterationsForRun(),
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        });
        activeChatRuns.delete(runId);
        activeSse = null;
        if (heartbeatService) heartbeatService.unregister(sessionId);
        try { reply.raw.write("data: [DONE]\n\n"); reply.raw.end(); } catch { }
        return;
      }
    }

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
      const maxIterations = getMaxIterationsForRun();
      const compactionConfig = economyMode.enabled ? economyMode.compaction : undefined;
      const totalUsage: UsageAccumulator = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      while (loops < maxIterations) {
        if (abortController.signal.aborted) {
          sse({ type: "aborted", runId });
          break;
        }
        loops++;
        sse({ type: "progress", iteration: loops, maxIterations });
        let messages = await chatService.buildApiMessages(sessionId);
        if (messages.length > 0 && messages[0]?.role === "system") {
          messages[0] = { role: "system" as const, content: dynamicSystemPrompt };
        }
        if (needsCompaction(messages, compactionConfig)) {
          messages = compactMessages(messages, compactionConfig);
          sse({ type: "compaction", messageCount: messages.length });
        }
        const activeThinkLevel = canThinkNow() ? thinkingConfig.level : "off";
        const baseConf: ChatRouteConfig = { ...config, ...getActiveConfig(), ...(agentModelOverride ? { model: agentModelOverride } : {}) };
        const modelsToTry = [baseConf.model, ...agentFallbacks];

        const useNonStreaming = shouldDisableStreaming(baseConf.model);

        let fullContent = "";
        const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();
        let hasToolCalls = false;
        let iterUsage: UsageAccumulator = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        if (useNonStreaming) {
          let nonStreamRes: { content: string | null; tool_calls?: ToolCall[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } | undefined;
          for (const model of modelsToTry) {
            try {
              nonStreamRes = await callLLM({ ...baseConf, model }, messages, agentToolDefs, false, activeThinkLevel, abortController.signal) as typeof nonStreamRes;
              break;
            } catch (err) {
              const isLast = model === modelsToTry[modelsToTry.length - 1];
              const canRetry = err instanceof LLMApiError && err.retryable;
              if (isLast || !canRetry) throw err;
              sse({ type: "fallback", failedModel: model, error: String(err) });
            }
          }
          if (!nonStreamRes) { sse({ type: "error", content: "All models failed" }); break; }

          fullContent = nonStreamRes.content ?? "";
          if (fullContent) sse({ type: "token", content: fullContent });
          if (nonStreamRes.usage) {
            iterUsage.promptTokens += nonStreamRes.usage.prompt_tokens ?? 0;
            iterUsage.completionTokens += nonStreamRes.usage.completion_tokens ?? 0;
            iterUsage.totalTokens += nonStreamRes.usage.total_tokens ?? 0;
          }

          if (nonStreamRes.tool_calls?.length) {
            hasToolCalls = true;
            for (let i = 0; i < nonStreamRes.tool_calls.length; i++) {
              const tc = nonStreamRes.tool_calls[i]!;
              pendingToolCalls.set(i, { id: tc.id, name: tc.function.name, args: tc.function.arguments });
            }
          }
        } else {
          let res: Response | undefined;
          for (const model of modelsToTry) {
            try {
              res = await callLLM({ ...baseConf, model }, messages, agentToolDefs, true, activeThinkLevel, abortController.signal) as Response;
              break;
            } catch (err) {
              const isLast = model === modelsToTry[modelsToTry.length - 1];
              const canRetry = err instanceof LLMApiError && err.retryable;
              if (isLast || !canRetry) throw err;
              sse({ type: "fallback", failedModel: model, error: String(err) });
            }
          }
          if (!res) { sse({ type: "error", content: "All models failed" }); break; }

          const reader = res.body?.getReader();
          if (!reader) { sse({ type: "error", content: "No response body" }); break; }

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
                    if (newThinking) sse({ type: "thinking", content: newThinking, streaming: true });
                    lastThinkingEmitted = thinking;
                  }
                  const visible = stripThinkingTags(fullContent);
                  const prevVisible = stripThinkingTags(fullContent.slice(0, -delta.content.length));
                  const visibleDelta = visible.slice(prevVisible.length);
                  if (visibleDelta) sse({ type: "token", content: visibleDelta });
                } else {
                  sse({ type: "token", content: delta.content });
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

              if (parsed.usage) {
                iterUsage.promptTokens += parsed.usage.prompt_tokens ?? 0;
                iterUsage.completionTokens += parsed.usage.completion_tokens ?? 0;
                iterUsage.totalTokens += parsed.usage.total_tokens ?? 0;
              }
            } catch { continue; }
          }
        }

        let visibleContent = fullContent;
        if (useTagReasoning()) {
          const blocks = splitThinkingTags(fullContent);
          if (blocks) {
            const thinkingText = blocks.filter((b) => b.type === "thinking").map((b) => b.content).join("\n");
            visibleContent = blocks.filter((b) => b.type === "text").map((b) => b.content).join("\n").trim();
            if (thinkingText && thinkingConfig.visibility !== "off" && thinkingConfig.visibility !== "stream") {
              sse({ type: "thinking", content: thinkingText });
            }
          }
        }

        if (iterUsage.totalTokens > 0) {
          totalUsage.promptTokens += iterUsage.promptTokens;
          totalUsage.completionTokens += iterUsage.completionTokens;
          totalUsage.totalTokens += iterUsage.totalTokens;
          sse({ type: "usage", usage: { ...totalUsage } });

          if (usageService) {
            const ac = getActiveConfig();
            usageService.record({
              sessionId,
              model: agentModelOverride ?? ac.model,
              provider: ac.provider,
              promptTokens: iterUsage.promptTokens,
              completionTokens: iterUsage.completionTokens,
              totalTokens: iterUsage.totalTokens,
            });
          }
        }

        if (!hasToolCalls) {
          await chatService.addAssistantMessage(sessionId, visibleContent);
          sse({ type: "done", content: visibleContent, iterations: loops, maxIterations, usage: { ...totalUsage } });
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
          if (abortController.signal.aborted) break;
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { }
          sse({ type: "tool_call", name: tc.function.name, args, iteration: loops, maxIterations });

          try {
            const result = await registry.execute(tc.function.name, args);
            const resultStr = truncateToolResult(
              JSON.stringify(result),
              getToolResultLimit(),
            );
            await chatService.addToolResult(sessionId, tc.id, resultStr);
            sse({ type: "tool_result", name: tc.function.name, result });
          } catch (err) {
            if (abortController.signal.aborted) break;
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
      if (abortController.signal.aborted) {
        sse({ type: "aborted", runId });
      } else {
        const failure = describeChatFailure(err);
        sse({
          type: "error",
          content: failure.message,
          recovery: failure.recovery,
          status: failure.status,
        });
      }
    } finally {
      activeChatRuns.delete(runId);
    }

    activeSse = null;
    if (heartbeatService) heartbeatService.unregister(sessionId);
    try { reply.raw.write("data: [DONE]\n\n"); reply.raw.end(); } catch { /* connection already closed */ }
  });

  app.post<{ Body: { runId?: string; sessionId?: string } }>("/chat/abort", async (req) => {
    const { runId, sessionId: targetSession } = req.body;

    if (runId) {
      const run = activeChatRuns.get(runId);
      if (!run) return { ok: true, aborted: false };
      run.controller.abort();
      activeChatRuns.delete(runId);
      return { ok: true, aborted: true, runId };
    }

    if (targetSession) {
      const aborted: string[] = [];
      for (const [id, run] of activeChatRuns) {
        if (run.sessionId === targetSession) {
          run.controller.abort();
          activeChatRuns.delete(id);
          aborted.push(id);
        }
      }
      return { ok: true, aborted: aborted.length > 0, runIds: aborted };
    }

    // Abort all active runs
    const aborted: string[] = [];
    for (const [id, run] of activeChatRuns) {
      run.controller.abort();
      aborted.push(id);
    }
    activeChatRuns.clear();
    return { ok: true, aborted: aborted.length > 0, runIds: aborted };
  });

  app.get<{ Querystring: { sessionId?: string } }>("/chat/history", async (req) => {
    const sessionId = req.query.sessionId ?? "default";
    return chatService.getHistory(sessionId);
  });

  const INTERNAL_SESSION_PREFIXES = ["run-", "cron-", "channel-", "send-", "agent-", "test-"];

  app.get("/chat/sessions", async () => {
    const all = await chatService.listSessions();
    return all.filter((s) => !INTERNAL_SESSION_PREFIXES.some((p) => s.id.startsWith(p)));
  });

  app.post<{ Body: { title?: string; agentId?: string } }>("/chat/sessions", async (req) => {
    const session = await chatService.createSession({ title: req.body.title, agentId: req.body.agentId });
    return { id: session.id, title: session.title, agentId: session.agentId, createdAt: session.createdAt };
  });

  app.get<{ Params: { id: string } }>("/chat/sessions/:id", async (req, reply) => {
    const session = await chatService.loadSession(req.params.id);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    const history = session.messages.filter((m) => m.role !== "system");
    return { id: session.id, title: session.title, agentId: session.agentId, createdAt: session.createdAt, updatedAt: session.updatedAt, messages: history };
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

  app.post<{ Params: { id: string } }>("/chat/sessions/:id/reset", async (req, reply) => {
    const reset = await chatService.resetSession(req.params.id);
    if (!reset) return reply.code(404).send({ error: "Session not found" });
    return { ok: true };
  });

  app.post<{ Body: { ids: string[] } }>("/chat/sessions/batch-delete", async (req, reply) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) return reply.code(400).send({ error: "ids array required" });
    let deleted = 0;
    for (const id of ids) {
      if (await chatService.deleteSession(id)) deleted++;
    }
    return { deleted };
  });

  const onboardingSvc = new OnboardingService();

  app.get("/chat/onboarding", async () => {
    return onboardingSvc.load();
  });

  app.post<{ Body: { userName?: string; botName?: string; timezone?: string; personality?: string; instructions?: string } }>("/chat/onboarding", async (req) => {
    return onboardingSvc.save(req.body);
  });
}
