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
import {
  resolveRunMode,
  shouldAutoApprove,
  getToolCategory,
  isUndoableTool,
  getReversalCommand,
  type RunModeConfig,
} from "../actions/index.js";
import { DriftDetector, buildStabilizer } from "../alignment/index.js";
import { parseAttachments, type ChatAttachment } from "../services/chat-attachments.js";
import type { ProviderService } from "../services/provider-service.js";
import { buildSystemPrompt } from "../services/system-prompt-builder.js";
import {
  needsCompaction,
  compactMessagesWithMeta,
} from "../services/context-window.js";
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
import type {
  SkillsService,
  SkillsSearchResult,
} from "../services/skills-service.js";
import type { DaemonOperationalState } from "../services/daemon-settings-service.js";

const MAX_TOOL_RESULT_CHARS = 30_000;
const DEFAULT_MAX_ITERATIONS = 10;
const ONE_DAY_MS = 86_400_000;
const NON_UNDOABLE_NOISE_TOOLS = new Set(["undo", "actions"]);
const SKILL_DISCOVERY_TIMEOUT_MS = 8_000;
const SKILL_DISCOVERY_MIN_MESSAGE_LENGTH = 24;
const SKILL_DISCOVERY_TRIGGER_RE =
  /\b(skill|skills|integration|integrate|plugin|connector|automation|automate|workflow|channel|capability|support|deploy|deployment|agent|discord|slack|telegram|whatsapp|shopify|salesforce|hubspot|jira|notion|gmail|google|stripe)\b/i;
const SKILL_DISCOVERY_INTENT_RE =
  /\b(help|need|want|can you|could you|how do i|is there|do you support|set up|setup|configure)\b/i;

type AutoSkillDiscovery = {
  query: string;
  results: SkillsSearchResult[];
};

function shouldAutoDiscoverSkills(message: string): boolean {
  const normalized = message.trim();
  if (normalized.length < SKILL_DISCOVERY_MIN_MESSAGE_LENGTH) return false;
  if (!SKILL_DISCOVERY_TRIGGER_RE.test(normalized)) return false;
  return SKILL_DISCOVERY_INTENT_RE.test(normalized);
}

function buildSkillSearchQuery(message: string): string {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "need",
    "want",
    "help",
    "please",
    "could",
    "would",
    "should",
    "have",
    "about",
  ]);
  const cleaned = message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token))
    .slice(0, 8);
  if (tokens.length >= 2) return tokens.join(" ");
  return cleaned.slice(0, 120);
}

function formatAutoSkillDiscoveryPrompt(discovery: AutoSkillDiscovery): string {
  const lines = [`Query: ${discovery.query}`];
  for (const result of discovery.results.slice(0, 3)) {
    lines.push(`- ${result.reference} (${result.url})`);
  }
  return lines.join("\n");
}

function formatAutoSkillDiscoveryHint(discovery: AutoSkillDiscovery): string {
  const refs = discovery.results
    .slice(0, 3)
    .map((result) => result.reference)
    .join(", ");
  return refs
    ? `Auto skill suggestions: ${refs}. Use "Approve & Install" to explicitly approve and install one in a single step.`
    : "Auto skill discovery ran, but no strong matches were found.";
}

async function maybeAutoDiscoverSkills(
  skillsService: SkillsService | undefined,
  message: string,
): Promise<AutoSkillDiscovery | null> {
  if (!skillsService) return null;
  if (!shouldAutoDiscoverSkills(message)) return null;

  const query = buildSkillSearchQuery(message);
  if (!query) return null;

  try {
    const search = await Promise.race([
      skillsService.searchRegistry(query),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SKILL_DISCOVERY_TIMEOUT_MS),
      ),
    ]);
    if (!search || !search.results?.length) return null;
    return {
      query,
      results: search.results.slice(0, 3),
    };
  } catch {
    return null;
  }
}

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

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

type UndoGuaranteeCheck = {
  allowed: boolean;
  reason?: string;
  recovery?: string;
};

function checkUndoGuarantee(
  toolName: string,
  args: Record<string, unknown>,
): UndoGuaranteeCheck {
  if (toolName === "undo" || toolName === "actions") {
    return { allowed: true };
  }

  if (toolName === "process") {
    const action = String(args.action ?? "list").toLowerCase();
    if (action === "list" || action === "poll" || action === "log") {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `process action "${action}" is not automatically undoable`,
      recovery:
        "Use list/poll/log only, or enable irreversible actions in run config.",
    };
  }

  if (toolName === "exec" || toolName === "bash" || toolName === "shell") {
    const command = String(args.command ?? args.cmd ?? args.script ?? "").trim();
    if (!command) {
      return {
        allowed: false,
        reason: "exec command is empty",
        recovery:
          "Provide a reversible command or enable irreversible actions in run config.",
      };
    }
    const cwd = typeof args.cwd === "string" ? args.cwd : undefined;
    const reversal = getReversalCommand(command, cwd);
    if (!reversal.canReverse) {
      return {
        allowed: false,
        reason:
          reversal.warning ??
          `exec command "${command.slice(0, 80)}" has no known automatic reversal`,
        recovery:
          "Use write_file/edit_file or a reversible exec command, or enable irreversible actions in run config.",
      };
    }
    return { allowed: true };
  }

  const category = getToolCategory(toolName);
  if (category !== "mutate" && category !== "exec") {
    const lower = toolName.toLowerCase();
    const looksMutating =
      /(?:create|update|delete|remove|toggle|set|install|spawn|send|write|edit|run|kill|sync|reconcile)/.test(
        lower,
      );
    if (looksMutating && !isUndoableTool(toolName)) {
      return {
        allowed: false,
        reason: `tool "${toolName}" looks mutating and has no automatic undo support`,
        recovery:
          "Use an undoable tool flow, or enable irreversible actions in run config.",
      };
    }
    return { allowed: true };
  }

  if (isUndoableTool(toolName)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `tool "${toolName}" performs ${category} operations without automatic undo support`,
    recovery:
      "Use an undoable tool flow, or enable irreversible actions in run config.",
  };
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
  getOperationalState?: () =>
    | DaemonOperationalState
    | Promise<DaemonOperationalState>,
) {
  let runModeConfig = config.runMode ?? resolveRunMode();
  let economyMode: EconomyModeConfig = resolveEconomyMode(config.economy);
  const parsedDailyBudgetUsd = Number(process.env.UNDOABLE_DAILY_BUDGET_USD ?? "");
  let dailyBudgetUsd: number | null =
    Number.isFinite(parsedDailyBudgetUsd) && parsedDailyBudgetUsd > 0
      ? parsedDailyBudgetUsd
      : null;
  let allowIrreversibleActions = process.env.UNDOABLE_ALLOW_IRREVERSIBLE_ACTIONS === "1";
  const autoPauseOnBudgetLimit = process.env.UNDOABLE_DAILY_BUDGET_AUTO_PAUSE !== "0";
  let spendPaused = false;
  const approvalMode = "off" as const;
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
  const getDailySpendUsd = () => (usageService ? usageService.getTotalCost(ONE_DAY_MS) : 0);
  const getSpendStatus = () => {
    const spentLast24hUsd = getDailySpendUsd();
    const exceeded =
      dailyBudgetUsd !== null && spentLast24hUsd >= dailyBudgetUsd;
    if (exceeded && autoPauseOnBudgetLimit) spendPaused = true;
    return {
      dailyBudgetUsd,
      spentLast24hUsd,
      remainingUsd:
        dailyBudgetUsd === null
          ? null
          : Math.max(0, dailyBudgetUsd - spentLast24hUsd),
      exceeded,
      autoPauseOnLimit: autoPauseOnBudgetLimit,
      paused: spendPaused,
    };
  };
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
  const resolveOperationalState = async (): Promise<DaemonOperationalState> => {
    if (!getOperationalState) {
      return {
        mode: "normal",
        reason: "",
        updatedAt: new Date().toISOString(),
      };
    }
    try {
      return await getOperationalState();
    } catch {
      return {
        mode: "normal",
        reason: "",
        updatedAt: new Date().toISOString(),
      };
    }
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

  const buildRunConfigResponse = async () => {
    const active = getActiveConfig();
    const spend = getSpendStatus();
    const operation = await resolveOperationalState();
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
      allowIrreversibleActions,
      undoGuaranteeEnabled: !allowIrreversibleActions,
      economy: {
        maxIterationsCap: economyMode.maxIterationsCap,
        toolResultMaxChars: economyMode.toolResultMaxChars,
        contextMaxTokens: economyMode.compaction.maxTokens,
        contextThreshold: economyMode.compaction.threshold,
      },
      spendGuard: {
        dailyBudgetUsd: spend.dailyBudgetUsd,
        spentLast24hUsd: spend.spentLast24hUsd,
        remainingUsd: spend.remainingUsd,
        exceeded: spend.exceeded,
        autoPauseOnLimit: spend.autoPauseOnLimit,
        paused: spend.paused,
      },
      operation,
    };
  };

  app.get("/chat/run-config", async () => {
    return await buildRunConfigResponse();
  });

  app.post<{ Body: { mode?: string; maxIterations?: number; economyMode?: boolean; dailyBudgetUsd?: number | null; spendPaused?: boolean; allowIrreversibleActions?: boolean } }>("/chat/run-config", async (req, reply) => {
    const {
      mode,
      maxIterations: newMax,
      economyMode: nextEconomyMode,
      dailyBudgetUsd: nextDailyBudgetUsd,
      spendPaused: nextSpendPaused,
      allowIrreversibleActions: nextAllowIrreversibleActions,
    } = req.body;
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
    if (nextDailyBudgetUsd !== undefined) {
      if (nextDailyBudgetUsd === null) {
        dailyBudgetUsd = null;
        spendPaused = false;
      } else if (
        typeof nextDailyBudgetUsd === "number" &&
        Number.isFinite(nextDailyBudgetUsd) &&
        nextDailyBudgetUsd > 0
      ) {
        dailyBudgetUsd = nextDailyBudgetUsd;
      } else {
        return reply
          .code(400)
          .send({ error: "dailyBudgetUsd must be a positive number or null" });
      }
    }
    if (nextSpendPaused !== undefined) {
      if (typeof nextSpendPaused !== "boolean") {
        return reply.code(400).send({ error: "spendPaused must be a boolean" });
      }
      spendPaused = nextSpendPaused;
    }
    if (nextAllowIrreversibleActions !== undefined) {
      if (typeof nextAllowIrreversibleActions !== "boolean") {
        return reply
          .code(400)
          .send({ error: "allowIrreversibleActions must be a boolean" });
      }
      allowIrreversibleActions = nextAllowIrreversibleActions;
    }
    getSpendStatus();
    return {
      ok: true,
      ...(await buildRunConfigResponse()),
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
        {
          const all = registry.actionLog.list();
          const nonUndoableRecent = all
            .filter((a) => !a.undoable && !NON_UNDOABLE_NOISE_TOOLS.has(a.toolName))
            .slice(-20)
            .map((a) => ({
              id: a.id,
              tool: a.toolName,
              category: a.category,
              startedAt: a.startedAt,
              error: a.error ?? null,
            }));
        return {
          recordedCount: all.length,
          undoable: toSummary(registry.undoService.listUndoable()),
          redoable: toSummary(registry.undoService.listRedoable()),
          nonUndoableRecent,
        };
        }
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

  app.post<{ Body: { message: string; sessionId?: string; agentId?: string; model?: string; attachments?: ChatAttachment[]; swarmMode?: boolean } }>("/chat", async (req, reply) => {
    const { message, agentId, model: requestModel, attachments } = req.body;
    const swarmMode = req.body.swarmMode === true;
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
    const directivesOnly = directives.length > 0 && !cleanMessage;

    const operationState = await resolveOperationalState();
    if (operationState.mode !== "normal" && !directivesOnly) {
      return reply.code(423).send({
        error: `Daemon is in ${operationState.mode} mode; new chat runs are blocked.`,
        code: "DAEMON_OPERATION_MODE_BLOCK",
        operation: operationState,
        recovery:
          "Set operation mode back to normal via /control/operation or `nrn daemon mode normal`.",
      });
    }

    const spendStatusBeforeRun = getSpendStatus();
    if (
      spendStatusBeforeRun.dailyBudgetUsd !== null &&
      spendStatusBeforeRun.exceeded &&
      spendStatusBeforeRun.paused &&
      !directivesOnly
    ) {
      return reply.code(429).send({
        error: `Daily spend limit reached (${formatUsd(
          spendStatusBeforeRun.spentLast24hUsd,
        )}/${formatUsd(
          spendStatusBeforeRun.dailyBudgetUsd,
        )} in last 24h). New runs are paused.`,
        code: "CHAT_SPEND_LIMIT_REACHED",
        spendGuard: spendStatusBeforeRun,
        recovery:
          "Wait for usage window to cool down, raise dailyBudgetUsd, or resume by setting spendPaused=false via /chat/run-config.",
      });
    }

    const autoSkillDiscovery = directivesOnly
      ? null
      : await maybeAutoDiscoverSkills(
          skillsService,
          cleanMessage || message || "",
        );

    const activeConf = getActiveConfig();
    const workspaceDir = agentWorkspace || os.homedir();
    const contextFiles = loadContextFiles(workspaceDir);
    const dynamicSystemPrompt = buildSystemPrompt({
      agentName,
      agentInstructions,
      skillsPrompt: skillsService?.getPrompt(),
      autoSkillDiscoveryPrompt: autoSkillDiscovery
        ? formatAutoSkillDiscoveryPrompt(autoSkillDiscovery)
        : undefined,
      toolDefinitions: agentToolDefs,
      contextFiles,
      economyMode: economyMode.enabled,
      undoGuaranteeEnabled: !allowIrreversibleActions,
      swarmMode,
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
      allowIrreversibleActions,
      undoGuaranteeEnabled: !allowIrreversibleActions,
      thinking: thinkingConfig.level, reasoningVisibility: thinkingConfig.visibility,
      model: activeConf.model, provider: activeConf.provider, canThink: canThinkNow(),
      spendGuard: getSpendStatus(),
    });

    if (autoSkillDiscovery) {
      sse({
        type: "warning",
        code: "skills_suggested",
        content: formatAutoSkillDiscoveryHint(autoSkillDiscovery),
        recovery:
          "Click Approve & Install on any suggestion, or ask to install a specific reference.",
        suggestedSkills: autoSkillDiscovery.results.map((result) => result.reference),
      });
    }

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
            allowIrreversibleActions,
            undoGuaranteeEnabled: !allowIrreversibleActions,
            maxIterations: getMaxIterationsForRun(),
            configuredMaxIterations,
            spendGuard: getSpendStatus(),
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
          const compacted = compactMessagesWithMeta(messages, compactionConfig);
          messages = compacted.messages;
          sse({
            type: "compaction",
            messageCount: messages.length,
            ...compacted.meta,
          });
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

        const spendStatus = getSpendStatus();
        if (
          spendStatus.dailyBudgetUsd !== null &&
          spendStatus.exceeded &&
          hasToolCalls
        ) {
          const budgetNote = `Daily spend limit reached (${formatUsd(
            spendStatus.spentLast24hUsd,
          )}/${formatUsd(
            spendStatus.dailyBudgetUsd,
          )} in last 24h). Skipping further tool execution for this run.`;
          sse({
            type: "warning",
            code: "spend_limit_reached",
            content: budgetNote,
            spendGuard: spendStatus,
          });
          const safeVisibleContent = (visibleContent || "").trim();
          const assistantContent = safeVisibleContent
            ? `${safeVisibleContent}\n\n${budgetNote}`
            : budgetNote;
          await chatService.addAssistantMessage(sessionId, assistantContent);
          sse({
            type: "done",
            content: assistantContent,
            iterations: loops,
            maxIterations,
            usage: { ...totalUsage },
            spendGuard: spendStatus,
          });
          break;
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

          const guarantee = checkUndoGuarantee(tc.function.name, args);
          if (!allowIrreversibleActions && !guarantee.allowed) {
            const category = getToolCategory(tc.function.name);
            const errorMessage = `Blocked by Undo Guarantee mode: ${guarantee.reason ?? `tool "${tc.function.name}" is not undoable`}.`;
            const blockedResult = {
              error: errorMessage,
              recovery:
                guarantee.recovery ??
                "Enable irreversible actions in run config to allow this operation.",
              blockedByUndoGuarantee: true,
              undoable: false,
              tool: tc.function.name,
              category,
            };
            const blockedAction = await registry.actionLog.record({
              runId,
              toolName: tc.function.name,
              category,
              args,
              approval: "auto-approved",
              undoable: false,
            });
            await registry.actionLog.complete(
              blockedAction.id,
              blockedResult,
              errorMessage,
            );
            const blockedStr = truncateToolResult(
              JSON.stringify(blockedResult),
              getToolResultLimit(),
            );
            await chatService.addToolResult(sessionId, tc.id, blockedStr);
            sse({
              type: "warning",
              code: "undo_guarantee_blocked",
              content: errorMessage,
              recovery: blockedResult.recovery,
              tool: tc.function.name,
            });
            sse({ type: "tool_result", name: tc.function.name, result: blockedResult });
            continue;
          }

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

  app.get<{ Querystring: { limit?: string } }>("/chat/sessions", async (req) => {
    const requestedLimit = Number(req.query.limit);
    const normalizedLimit = Number.isFinite(requestedLimit)
      ? Math.min(1000, Math.max(20, Math.floor(requestedLimit)))
      : 200;
    const scanLimit = Math.min(5000, normalizedLimit * 4);
    const all = await chatService.listSessions({ limit: scanLimit });
    const visible: typeof all = [];
    for (const session of all) {
      if (INTERNAL_SESSION_PREFIXES.some((p) => session.id.startsWith(p))) {
        continue;
      }
      visible.push(session);
      if (visible.length >= normalizedLimit) {
        break;
      }
    }
    return visible;
  });

  app.post<{ Body: { title?: string; agentId?: string } }>("/chat/sessions", async (req) => {
    const agentId = req.body.agentId;
    let agentName: string | undefined;
    let agentInstructions: string | undefined;
    let agentWorkspace: string | undefined;
    let agentModel: string | undefined;
    let agentToolDefs = registry.definitions;

    if (agentId && agentRegistry) {
      const agent = agentRegistry.get(agentId);
      if (agent?.name) agentName = agent.name;
      if (agent?.workspace) agentWorkspace = agent.workspace;
      if (agent?.model) agentModel = agent.model;
      if (agent?.tools) agentToolDefs = filterToolsByPolicy(registry.definitions, agent.tools);
      if (instructionsStore) {
        agentInstructions = (await instructionsStore.getCurrent(agentId)) ?? undefined;
      }
    }

    const activeConf = getActiveConfig();
    const workspaceDir = agentWorkspace || os.homedir();
    const contextFiles = loadContextFiles(workspaceDir);
    const sessionSystemPrompt = buildSystemPrompt({
      agentName,
      agentInstructions,
      skillsPrompt: skillsService?.getPrompt(),
      toolDefinitions: agentToolDefs,
      contextFiles,
      economyMode: economyMode.enabled,
      undoGuaranteeEnabled: !allowIrreversibleActions,
      workspaceDir,
      runtime: {
        model: agentModel ?? activeConf.model,
        provider: activeConf.provider,
        os: `${os.platform()} ${os.release()}`,
        arch: os.arch(),
        node: process.version,
      },
    });

    const session = await chatService.createSession({
      title: req.body.title,
      agentId,
      systemPrompt: sessionSystemPrompt,
    });
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
