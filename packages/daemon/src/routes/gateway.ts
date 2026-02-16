import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { SchedulerService } from "@undoable/core";
import type { JobCreate, JobPatch } from "@undoable/core";
import { DEFAULT_CONFIG, getConfigValue, mergeConfig, setConfigValue, validateConfig } from "@undoable/core";
import type { UndoableConfig } from "@undoable/core";
import type { ChatService } from "../services/chat-service.js";
import type { SessionHealth } from "../services/heartbeat-service.js";
import type { WizardAnswer, WizardService } from "../services/wizard-service.js";
import type { CronRunLogService } from "../services/cron-run-log-service.js";
import type { SkillsService } from "../services/skills-service.js";
import type { ChannelManager } from "../channels/index.js";
import type { ChannelId } from "../channels/types.js";
import type { BrowserService } from "../services/browser-service.js";
import type { ExecApprovalService, ExecApprovalDecision } from "../services/exec-approval-service.js";
import type { NodeGatewayService } from "../services/node-gateway-service.js";
import type { ConnectorConfig } from "../connectors/types.js";
import type { InstructionsStore } from "../services/instructions-store.js";

type GatewayConnectorInfo = {
  nodeId: string;
  displayName: string;
  platform?: string;
  capabilities?: string[];
  commands?: string[];
  connected?: boolean;
  connectedAt?: number;
};

type GatewayConnectorRegistry = {
  add(config: ConnectorConfig): Promise<{ info(): GatewayConnectorInfo }>;
  get(nodeId: string): { info(): GatewayConnectorInfo } | undefined;
  listConnected(): GatewayConnectorInfo[];
  invoke(nodeId: string, command: string, params?: unknown): Promise<{
    ok: boolean;
    payload?: unknown;
    error?: unknown;
  }>;
};

type GatewayMethodCode = "INVALID_REQUEST" | "METHOD_NOT_FOUND" | "UNAVAILABLE";

type GatewayError = {
  code: GatewayMethodCode;
  message: string;
};

type GatewayResponse =
  | {
      ok: true;
      result: unknown;
      error?: undefined;
    }
  | {
      ok: false;
      result?: undefined;
      error: GatewayError;
    };

type GatewayRequestBody = {
  method?: unknown;
  params?: unknown;
};

type GatewayRouteDeps = {
  scheduler: Pick<SchedulerService, "status" | "list" | "add" | "update" | "remove" | "run">;
  cronRuns: Pick<CronRunLogService, "list">;
  chatService: Pick<ChatService, "getHistory" | "listSessions" | "loadSession" | "renameSession" | "resetSession" | "deleteSession" | "addUserMessage">;
  heartbeatService: {
    listSessions(): Array<{ sessionId: string; health: SessionHealth; lastHeartbeatAt: number; lastActivityAt: number; connectedAt: number; sseActive: boolean; agentId?: string }>;
    ping(sessionId: string): SessionHealth;
    getHealth(sessionId: string): SessionHealth;
    activeCount: number;
  };
  wizardService: Pick<WizardService, "start" | "next" | "cancel" | "status">;
  skillsService: Pick<
    SkillsService,
    "list" | "bins" | "toggle" | "getByName" | "getDangerWarning" | "searchRegistry" | "installFromRegistry"
  >;
  channelManager: Pick<ChannelManager, "listAll" | "getStatus" | "updateConfig" | "stopChannel">;
  browserService: Pick<
    BrowserService,
    | "navigate"
    | "click"
    | "type"
    | "screenshot"
    | "evaluate"
    | "getText"
    | "tabs"
    | "openTab"
    | "closeTab"
    | "focusTab"
    | "snapshot"
    | "pdf"
    | "armDialog"
    | "uploadFile"
    | "waitForSelector"
    | "scroll"
    | "setHeadless"
    | "isHeadless"
  >;
  execApprovalService: Pick<ExecApprovalService, "create" | "waitForDecision" | "resolve" | "getSnapshot">;
  nodeGatewayService: Pick<
    NodeGatewayService,
    | "requestPairing"
    | "listPairing"
    | "approvePairing"
    | "rejectPairing"
    | "verifyToken"
    | "renameNode"
    | "rotateToken"
    | "revokeToken"
    | "getPaired"
    | "recordInvokeResult"
    | "recordNodeEvent"
  >;
  connectorRegistry: GatewayConnectorRegistry;
  providerService: {
    listAllModels(): Array<{ id: string; name: string; provider: string; capabilities?: unknown; contextWindow?: number }>;
    getActiveConfig(): { provider: string; model: string };
  };
  agentRegistry: Pick<
    {
      list(): Array<{ id: string; name?: string; model: string; identity?: unknown; skills?: string[]; sandbox?: unknown; default?: boolean }>;
      get(id: string): { id: string; name?: string; model: string; identity?: unknown; skills?: string[]; sandbox?: unknown; default?: boolean } | undefined;
      getDefaultId(): string;
      register(config: { id: string; name?: string; model: string; skills?: string[]; sandbox?: unknown; default?: boolean }): void;
      update(id: string, patch: Record<string, unknown>): { id: string; name?: string; model: string; identity?: unknown; skills?: string[]; sandbox?: unknown; default?: boolean } | undefined;
      remove(id: string): boolean;
    },
    "list" | "get" | "getDefaultId" | "register" | "update" | "remove"
  >;
  instructionsStore: Pick<InstructionsStore, "getCurrent" | "save" | "deleteAll">;
};

const CHANNEL_IDS: ChannelId[] = ["telegram", "discord", "slack", "whatsapp"];
const DEFAULT_CHANNEL_ACCOUNT_ID = "default";

function parseChannelId(value: unknown): ChannelId | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return CHANNEL_IDS.includes(trimmed as ChannelId) ? (trimmed as ChannelId) : null;
}

function resolveJobId(params: Record<string, unknown>): string | null {
  const candidate = params.id ?? params.jobId;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed ? trimmed : null;
}

function resolveNodeId(params: Record<string, unknown>): string | null {
  const candidate = params.nodeId ?? params.deviceId;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed ? trimmed : null;
}

function parseConnectorConfig(raw: unknown): ConnectorConfig | null {
  if (!isRecord(raw)) return null;
  const type = typeof raw.type === "string" ? raw.type : "";
  if (type === "local") {
    return {
      type: "local",
      displayName: typeof raw.displayName === "string" ? raw.displayName : undefined,
    };
  }
  if (type === "ssh") {
    if (typeof raw.host !== "string" || typeof raw.username !== "string") return null;
    return {
      type: "ssh",
      host: raw.host,
      username: raw.username,
      port: typeof raw.port === "number" ? raw.port : undefined,
      privateKeyPath: typeof raw.privateKeyPath === "string" ? raw.privateKeyPath : undefined,
      password: typeof raw.password === "string" ? raw.password : undefined,
      displayName: typeof raw.displayName === "string" ? raw.displayName : undefined,
    };
  }
  if (type === "docker") {
    if (typeof raw.container !== "string") return null;
    return {
      type: "docker",
      container: raw.container,
      image: typeof raw.image === "string" ? raw.image : undefined,
      displayName: typeof raw.displayName === "string" ? raw.displayName : undefined,
    };
  }
  if (type === "websocket") {
    if (typeof raw.url !== "string") return null;
    return {
      type: "websocket",
      url: raw.url,
      token: typeof raw.token === "string" ? raw.token : undefined,
      displayName: typeof raw.displayName === "string" ? raw.displayName : undefined,
    };
  }
  return null;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(error: GatewayError): GatewayResponse {
  return { ok: false, error };
}

export function gatewayRoutes(app: FastifyInstance, deps: GatewayRouteDeps) {
  let gatewayConfig: UndoableConfig = structuredClone(DEFAULT_CONFIG);
  let talkMode = "chat";
  const abortedSessions = new Set<string>();
  const gatewayLogs: Array<{ ts: number; level: "info" | "warn" | "error"; message: string; meta?: unknown }> = [];
  const execApprovalPolicy = {
    mode: "mutate",
    allowlist: [] as string[],
  };
  const execApprovalNodePolicy = new Map<string, { mode: string; allowlist: string[] }>();
  const ttsState = {
    enabled: false,
    provider: "system",
    providers: ["system"],
  };
  const voicewakeState: {
    enabled: boolean;
    phrase: string;
    sensitivity: number;
    updatedAtMs: number;
  } = {
    enabled: false,
    phrase: "hey undoable",
    sensitivity: 0.5,
    updatedAtMs: Date.now(),
  };
  const usageState = {
    startedAtMs: Date.now(),
    totalCalls: 0,
    totalCostUsd: 0,
  };

  app.post<{ Body: GatewayRequestBody; Reply: GatewayResponse }>("/gateway", async (req) => {
    const body = req.body;

    if (!body || typeof body.method !== "string" || body.method.trim().length === 0) {
      return fail({ code: "INVALID_REQUEST", message: "method is required" });
    }

    const method = body.method.trim();
    if (body.params !== undefined && !isRecord(body.params)) {
      return fail({ code: "INVALID_REQUEST", message: "params must be an object" });
    }
    const params = (body.params ?? {}) as Record<string, unknown>;
    usageState.totalCalls += 1;
    gatewayLogs.push({ ts: Date.now(), level: "info", message: `gateway.${method}` });
    if (gatewayLogs.length > 500) gatewayLogs.splice(0, gatewayLogs.length - 500);

    try {
      switch (method) {
        case "health":
          return {
            ok: true,
            result: {
              status: "ok",
              version: "0.1.0",
              uptime: process.uptime(),
            },
          };

        case "status": {
          const scheduler = await deps.scheduler.status();
          return {
            ok: true,
            result: {
              uptime: process.uptime(),
              scheduler,
            },
          };
        }

        case "tts.status": {
          return {
            ok: true,
            result: {
              enabled: ttsState.enabled,
              provider: ttsState.provider,
              providers: ttsState.providers,
            },
          };
        }

        case "tts.providers": {
          return {
            ok: true,
            result: {
              providers: ttsState.providers,
              active: ttsState.provider,
            },
          };
        }

        case "tts.enable": {
          ttsState.enabled = true;
          return {
            ok: true,
            result: {
              enabled: ttsState.enabled,
              provider: ttsState.provider,
            },
          };
        }

        case "tts.disable": {
          ttsState.enabled = false;
          return {
            ok: true,
            result: {
              enabled: ttsState.enabled,
              provider: ttsState.provider,
            },
          };
        }

        case "tts.setProvider": {
          const provider = typeof params.provider === "string" ? params.provider.trim() : "";
          if (!provider) {
            return fail({ code: "INVALID_REQUEST", message: "tts.setProvider requires provider" });
          }
          if (!ttsState.providers.includes(provider)) {
            ttsState.providers.push(provider);
          }
          ttsState.provider = provider;
          return {
            ok: true,
            result: {
              provider: ttsState.provider,
              providers: ttsState.providers,
            },
          };
        }

        case "tts.convert": {
          const text = typeof params.text === "string" ? params.text : "";
          if (!text.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "tts.convert requires text" });
          }
          const format = typeof params.format === "string" && params.format.trim() ? params.format.trim() : "wav";
          return {
            ok: true,
            result: {
              provider: ttsState.provider,
              format,
              audioBase64: Buffer.from(text).toString("base64"),
            },
          };
        }

        case "logs.tail": {
          const limit = typeof params.limit === "number" && Number.isFinite(params.limit)
            ? Math.max(1, Math.min(500, Math.floor(params.limit)))
            : 100;
          return { ok: true, result: { logs: gatewayLogs.slice(-limit) } };
        }

        case "exec.approvals.get": {
          return {
            ok: true,
            result: {
              mode: execApprovalPolicy.mode,
              allowlist: execApprovalPolicy.allowlist,
            },
          };
        }

        case "exec.approvals.set": {
          const mode = typeof params.mode === "string" ? params.mode.trim() : "";
          if (mode && mode !== "off" && mode !== "mutate" && mode !== "always") {
            return fail({ code: "INVALID_REQUEST", message: "exec.approvals.set invalid mode" });
          }
          if (params.allowlist !== undefined && (!Array.isArray(params.allowlist) || !params.allowlist.every((v) => typeof v === "string"))) {
            return fail({ code: "INVALID_REQUEST", message: "exec.approvals.set allowlist must be string[]" });
          }
          if (mode) execApprovalPolicy.mode = mode;
          if (Array.isArray(params.allowlist)) execApprovalPolicy.allowlist = [...params.allowlist];
          return { ok: true, result: { mode: execApprovalPolicy.mode, allowlist: execApprovalPolicy.allowlist } };
        }

        case "exec.approvals.node.get": {
          const nodeId = resolveNodeId(params);
          if (!nodeId) {
            return fail({ code: "INVALID_REQUEST", message: "exec.approvals.node.get requires nodeId" });
          }
          const policy = execApprovalNodePolicy.get(nodeId) ?? {
            mode: execApprovalPolicy.mode,
            allowlist: execApprovalPolicy.allowlist,
          };
          return { ok: true, result: { nodeId, ...policy } };
        }

        case "exec.approvals.node.set": {
          const nodeId = resolveNodeId(params);
          if (!nodeId) {
            return fail({ code: "INVALID_REQUEST", message: "exec.approvals.node.set requires nodeId" });
          }
          const mode = typeof params.mode === "string" ? params.mode.trim() : "";
          if (mode && mode !== "off" && mode !== "mutate" && mode !== "always") {
            return fail({ code: "INVALID_REQUEST", message: "exec.approvals.node.set invalid mode" });
          }
          if (params.allowlist !== undefined && (!Array.isArray(params.allowlist) || !params.allowlist.every((v) => typeof v === "string"))) {
            return fail({ code: "INVALID_REQUEST", message: "exec.approvals.node.set allowlist must be string[]" });
          }
          const existing = execApprovalNodePolicy.get(nodeId) ?? {
            mode: execApprovalPolicy.mode,
            allowlist: execApprovalPolicy.allowlist,
          };
          const next = {
            mode: mode || existing.mode,
            allowlist: Array.isArray(params.allowlist) ? [...params.allowlist] : existing.allowlist,
          };
          execApprovalNodePolicy.set(nodeId, next);
          return { ok: true, result: { nodeId, ...next } };
        }

        case "talk.mode": {
          if (params.mode !== undefined) {
            if (typeof params.mode !== "string" || !params.mode.trim()) {
              return fail({ code: "INVALID_REQUEST", message: "talk.mode mode must be non-empty string" });
            }
            talkMode = params.mode.trim();
          }
          return { ok: true, result: { mode: talkMode } };
        }

        case "models.list": {
          const active = deps.providerService.getActiveConfig();
          const models = deps.providerService.listAllModels();
          return {
            ok: true,
            result: {
              active,
              models,
            },
          };
        }

        case "update.run": {
          return {
            ok: true,
            result: {
              started: true,
              updateId: randomUUID(),
            },
          };
        }

        case "sessions.list": {
          const sessions = await deps.chatService.listSessions();
          return { ok: true, result: { sessions } };
        }

        case "sessions.preview": {
          const sessionId = typeof params.sessionId === "string"
            ? params.sessionId.trim()
            : typeof params.id === "string"
              ? params.id.trim()
              : "";
          if (!sessionId) {
            return fail({ code: "INVALID_REQUEST", message: "sessions.preview requires sessionId" });
          }
          const session = await deps.chatService.loadSession(sessionId);
          if (!session) {
            return fail({ code: "INVALID_REQUEST", message: "unknown session id" });
          }
          const messages = session.messages.filter((m) => m.role !== "system");
          return {
            ok: true,
            result: {
              id: session.id,
              title: session.title,
              agentId: session.agentId,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              messageCount: messages.length,
              preview: messages.length
                ? String(messages[messages.length - 1]?.content ?? "").slice(0, 120)
                : "",
            },
          };
        }

        case "sessions.patch": {
          const sessionId = typeof params.sessionId === "string"
            ? params.sessionId.trim()
            : typeof params.id === "string"
              ? params.id.trim()
              : "";
          if (!sessionId) {
            return fail({ code: "INVALID_REQUEST", message: "sessions.patch requires sessionId" });
          }
          const title = typeof params.title === "string" ? params.title.trim() : "";
          if (!title) {
            return fail({ code: "INVALID_REQUEST", message: "sessions.patch requires title" });
          }
          const renamed = await deps.chatService.renameSession(sessionId, title);
          if (!renamed) {
            return fail({ code: "INVALID_REQUEST", message: "unknown session id" });
          }
          return { ok: true, result: { ok: true, id: sessionId, title } };
        }

        case "sessions.reset": {
          const sessionId = typeof params.sessionId === "string"
            ? params.sessionId.trim()
            : typeof params.id === "string"
              ? params.id.trim()
              : "";
          if (!sessionId) {
            return fail({ code: "INVALID_REQUEST", message: "sessions.reset requires sessionId" });
          }
          const reset = await deps.chatService.resetSession(sessionId);
          if (!reset) {
            return fail({ code: "INVALID_REQUEST", message: "unknown session id" });
          }
          return { ok: true, result: { ok: true, id: sessionId } };
        }

        case "sessions.delete": {
          const sessionId = typeof params.sessionId === "string"
            ? params.sessionId.trim()
            : typeof params.id === "string"
              ? params.id.trim()
              : "";
          if (!sessionId) {
            return fail({ code: "INVALID_REQUEST", message: "sessions.delete requires sessionId" });
          }
          const deleted = await deps.chatService.deleteSession(sessionId);
          if (!deleted) {
            return fail({ code: "INVALID_REQUEST", message: "unknown session id" });
          }
          return { ok: true, result: { ok: true, id: sessionId, deleted: true } };
        }

        case "sessions.compact": {
          return {
            ok: true,
            result: {
              ok: true,
              removed: 0,
            },
          };
        }

        case "last-heartbeat": {
          const sessionId = typeof params.sessionId === "string" ? params.sessionId.trim() : "";
          if (!sessionId) {
            return fail({ code: "INVALID_REQUEST", message: "last-heartbeat requires sessionId" });
          }
          const sessions = deps.heartbeatService.listSessions();
          const row = sessions.find((entry) => entry.sessionId === sessionId);
          if (!row) {
            return fail({ code: "INVALID_REQUEST", message: "unknown session id" });
          }
          return {
            ok: true,
            result: {
              sessionId,
              health: row.health,
              lastHeartbeatAt: row.lastHeartbeatAt,
              lastActivityAt: row.lastActivityAt,
            },
          };
        }

        case "set-heartbeats": {
          if (!Array.isArray(params.sessionIds) || !params.sessionIds.every((v) => typeof v === "string")) {
            return fail({ code: "INVALID_REQUEST", message: "set-heartbeats requires sessionIds string[]" });
          }
          const updated = (params.sessionIds as string[]).map((sessionId) => ({
            sessionId,
            health: deps.heartbeatService.ping(sessionId),
            ts: Date.now(),
          }));
          return { ok: true, result: { updated } };
        }

        case "system-presence": {
          const sessions = deps.heartbeatService.listSessions();
          return {
            ok: true,
            result: {
              ts: Date.now(),
              activeCount: deps.heartbeatService.activeCount,
              sessions,
            },
          };
        }

        case "system-event": {
          const event = typeof params.event === "string" ? params.event.trim() : "";
          if (!event) {
            return fail({ code: "INVALID_REQUEST", message: "system-event requires event" });
          }
          return {
            ok: true,
            result: {
              ok: true,
              event,
              ts: Date.now(),
            },
          };
        }

        case "usage.status": {
          return {
            ok: true,
            result: {
              startedAtMs: usageState.startedAtMs,
              uptimeMs: Date.now() - usageState.startedAtMs,
              totalCalls: usageState.totalCalls,
              totalCostUsd: usageState.totalCostUsd,
            },
          };
        }

        case "usage.cost": {
          const days = typeof params.days === "number" && Number.isFinite(params.days) ? params.days : 30;
          if (typeof params.days === "number" && (!Number.isFinite(params.days) || params.days <= 0)) {
            return fail({ code: "INVALID_REQUEST", message: "usage.cost days must be a positive number" });
          }
          return {
            ok: true,
            result: {
              days,
              totalUsd: usageState.totalCostUsd,
            },
          };
        }

        case "config.get": {
          const key = typeof params.key === "string" ? params.key.trim() : "";
          if (!key) {
            return { ok: true, result: { config: gatewayConfig } };
          }
          return {
            ok: true,
            result: {
              key,
              value: getConfigValue(gatewayConfig, key),
            },
          };
        }

        case "config.set": {
          const key = typeof params.key === "string" ? params.key.trim() : "";
          if (!key) {
            return fail({ code: "INVALID_REQUEST", message: "config.set requires key" });
          }
          const nextConfig = setConfigValue(gatewayConfig, key, params.value);
          const validation = validateConfig(nextConfig as unknown as Record<string, unknown>);
          if (!validation.valid) {
            return fail({ code: "INVALID_REQUEST", message: validation.errors.join("; ") });
          }
          gatewayConfig = nextConfig;
          return {
            ok: true,
            result: {
              key,
              value: getConfigValue(gatewayConfig, key),
            },
          };
        }

        case "config.patch":
        case "config.apply": {
          const rawPatch = method === "config.apply" ? (params.config ?? params.patch) : params.patch;
          if (!isRecord(rawPatch)) {
            return fail({ code: "INVALID_REQUEST", message: `${method} requires patch object` });
          }
          const nextConfig = mergeConfig(gatewayConfig, rawPatch);
          const validation = validateConfig(nextConfig as unknown as Record<string, unknown>);
          if (!validation.valid) {
            return fail({ code: "INVALID_REQUEST", message: validation.errors.join("; ") });
          }
          gatewayConfig = nextConfig;
          return { ok: true, result: { config: gatewayConfig } };
        }

        case "config.schema": {
          return {
            ok: true,
            result: {
              default: DEFAULT_CONFIG,
            },
          };
        }

        case "voicewake.get": {
          return { ok: true, result: voicewakeState };
        }

        case "voicewake.set": {
          if (params.enabled !== undefined && typeof params.enabled !== "boolean") {
            return fail({ code: "INVALID_REQUEST", message: "voicewake.set enabled must be boolean" });
          }
          if (params.phrase !== undefined && (typeof params.phrase !== "string" || !params.phrase.trim())) {
            return fail({ code: "INVALID_REQUEST", message: "voicewake.set phrase must be a non-empty string" });
          }
          if (
            params.sensitivity !== undefined
            && (typeof params.sensitivity !== "number" || !Number.isFinite(params.sensitivity) || params.sensitivity < 0 || params.sensitivity > 1)
          ) {
            return fail({ code: "INVALID_REQUEST", message: "voicewake.set sensitivity must be a number between 0 and 1" });
          }
          if (typeof params.enabled === "boolean") voicewakeState.enabled = params.enabled;
          if (typeof params.phrase === "string") voicewakeState.phrase = params.phrase.trim();
          if (typeof params.sensitivity === "number") voicewakeState.sensitivity = params.sensitivity;
          voicewakeState.updatedAtMs = Date.now();
          return { ok: true, result: voicewakeState };
        }

        case "agent.identity.get": {
          const explicitAgentId = typeof params.agentId === "string"
            ? params.agentId.trim()
            : typeof params.id === "string"
              ? params.id.trim()
              : "";
          const agentId = explicitAgentId || (() => {
            try {
              return deps.agentRegistry.getDefaultId();
            } catch {
              return "";
            }
          })();
          if (!agentId) {
            return fail({ code: "INVALID_REQUEST", message: "agent.identity.get requires agentId" });
          }
          const agent = deps.agentRegistry.get(agentId);
          if (!agent) {
            return fail({ code: "INVALID_REQUEST", message: "unknown agent id" });
          }
          return {
            ok: true,
            result: {
              agentId: agent.id,
              name: agent.name ?? agent.id,
              model: agent.model,
              identity: agent.identity ?? null,
            },
          };
        }

        case "agents.list": {
          const agents = deps.agentRegistry.list();
          const result = await Promise.all(agents.map(async (agent) => {
            const instructions = await deps.instructionsStore.getCurrent(agent.id);
            return {
              id: agent.id,
              name: agent.name ?? agent.id,
              model: agent.model,
              skills: Array.isArray(agent.skills) ? agent.skills : [],
              sandbox: agent.sandbox,
              default: agent.default ?? false,
              instructions: instructions ?? undefined,
            };
          }));
          return { ok: true, result: { agents: result } };
        }

        case "agents.create": {
          const id = typeof params.id === "string" ? params.id.trim() : "";
          const model = typeof params.model === "string" ? params.model.trim() : "";
          if (!id || !model) {
            return fail({ code: "INVALID_REQUEST", message: "agents.create requires id and model" });
          }
          if (deps.agentRegistry.get(id)) {
            return fail({ code: "INVALID_REQUEST", message: "agent already exists" });
          }
          const config = {
            id,
            name: typeof params.name === "string" && params.name.trim() ? params.name.trim() : id,
            model,
            skills: Array.isArray(params.skills) ? params.skills.filter((s): s is string => typeof s === "string") : [],
            sandbox: isRecord(params.sandbox) ? params.sandbox : { docker: false, network: false, browser: false },
            default: params.default === true,
          };
          deps.agentRegistry.register(config);
          const instructions = typeof params.instructions === "string" ? params.instructions : null;
          if (instructions !== null) {
            await deps.instructionsStore.save(id, instructions, "Initial version");
          }
          return {
            ok: true,
            result: {
              ...config,
              instructions: instructions ?? undefined,
            },
          };
        }

        case "agents.update": {
          const id = typeof params.id === "string" ? params.id.trim() : "";
          if (!id) {
            return fail({ code: "INVALID_REQUEST", message: "agents.update requires id" });
          }
          const existing = deps.agentRegistry.get(id);
          if (!existing) {
            return fail({ code: "INVALID_REQUEST", message: "unknown agent id" });
          }
          const patch: Record<string, unknown> = {};
          if (typeof params.name === "string" && params.name.trim()) patch.name = params.name.trim();
          if (typeof params.model === "string" && params.model.trim()) patch.model = params.model.trim();
          if (Array.isArray(params.skills)) patch.skills = params.skills.filter((s): s is string => typeof s === "string");
          if (isRecord(params.sandbox)) patch.sandbox = { ...(existing.sandbox as Record<string, unknown> | undefined), ...params.sandbox };
          if (typeof params.default === "boolean") patch.default = params.default;
          const updated = deps.agentRegistry.update(id, patch);
          if (!updated) {
            return fail({ code: "INVALID_REQUEST", message: "unknown agent id" });
          }
          if (typeof params.instructions === "string") {
            await deps.instructionsStore.save(id, params.instructions);
          }
          const currentInstructions = await deps.instructionsStore.getCurrent(id);
          return { ok: true, result: { ...updated, instructions: currentInstructions ?? undefined } };
        }

        case "agents.delete": {
          const id = typeof params.id === "string" ? params.id.trim() : "";
          if (!id) {
            return fail({ code: "INVALID_REQUEST", message: "agents.delete requires id" });
          }
          const deleted = deps.agentRegistry.remove(id);
          if (!deleted) {
            return fail({ code: "INVALID_REQUEST", message: "unknown agent id" });
          }
          await deps.instructionsStore.deleteAll(id);
          return { ok: true, result: { deleted: true, id } };
        }

        case "agents.files.list": {
          const agentId = typeof params.agentId === "string" ? params.agentId.trim() : "";
          if (!agentId) {
            return fail({ code: "INVALID_REQUEST", message: "agents.files.list requires agentId" });
          }
          const content = await deps.instructionsStore.getCurrent(agentId);
          return {
            ok: true,
            result: {
              agentId,
              files: [
                {
                  path: "instructions.md",
                  exists: content !== null,
                  size: content?.length ?? 0,
                },
              ],
            },
          };
        }

        case "agents.files.get": {
          const agentId = typeof params.agentId === "string" ? params.agentId.trim() : "";
          if (!agentId) {
            return fail({ code: "INVALID_REQUEST", message: "agents.files.get requires agentId" });
          }
          const path = typeof params.path === "string" && params.path.trim() ? params.path.trim() : "instructions.md";
          if (path !== "instructions.md") {
            return fail({ code: "INVALID_REQUEST", message: "unknown agent file" });
          }
          const content = await deps.instructionsStore.getCurrent(agentId);
          if (content === null) {
            return fail({ code: "INVALID_REQUEST", message: "agent file not found" });
          }
          return { ok: true, result: { agentId, path, content } };
        }

        case "agents.files.set": {
          const agentId = typeof params.agentId === "string" ? params.agentId.trim() : "";
          if (!agentId) {
            return fail({ code: "INVALID_REQUEST", message: "agents.files.set requires agentId" });
          }
          const path = typeof params.path === "string" && params.path.trim() ? params.path.trim() : "instructions.md";
          if (path !== "instructions.md") {
            return fail({ code: "INVALID_REQUEST", message: "unknown agent file" });
          }
          if (typeof params.content !== "string") {
            return fail({ code: "INVALID_REQUEST", message: "agents.files.set requires content" });
          }
          const version = await deps.instructionsStore.save(agentId, params.content, typeof params.summary === "string" ? params.summary : undefined);
          return { ok: true, result: { agentId, path, version } };
        }

        case "wake": {
          const mode = params.mode;
          if (mode !== undefined && mode !== "now" && mode !== "next-heartbeat") {
            return fail({ code: "INVALID_REQUEST", message: "wake mode must be now or next-heartbeat" });
          }

          const jobs = await deps.scheduler.list({ includeDisabled: false });
          const runMode = mode === "next-heartbeat" ? "due" : "force";
          let ran = 0;

          for (const job of jobs) {
            const didRun = await deps.scheduler.run(job.id, runMode);
            if (didRun) ran += 1;
          }

          return {
            ok: true,
            result: {
              mode: mode ?? "now",
              attempted: jobs.length,
              ran,
              text: typeof params.text === "string" ? params.text : "",
            },
          };
        }

        case "cron.list": {
          const includeDisabled = params.includeDisabled;
          if (includeDisabled !== undefined && typeof includeDisabled !== "boolean") {
            return fail({ code: "INVALID_REQUEST", message: "cron.list includeDisabled must be boolean" });
          }
          const jobs = await deps.scheduler.list({ includeDisabled });
          return { ok: true, result: { jobs } };
        }

        case "cron.status": {
          const status = await deps.scheduler.status();
          return { ok: true, result: status };
        }

        case "cron.add": {
          const name = params.name;
          const schedule = params.schedule;
          const payload = params.payload;

          if (typeof name !== "string" || !name.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "cron.add requires name" });
          }
          if (!isRecord(schedule)) {
            return fail({ code: "INVALID_REQUEST", message: "cron.add requires schedule" });
          }
          if (!isRecord(payload)) {
            return fail({ code: "INVALID_REQUEST", message: "cron.add requires payload" });
          }

          const job = await deps.scheduler.add({
            name: name.trim(),
            description: typeof params.description === "string" ? params.description : undefined,
            enabled: typeof params.enabled === "boolean" ? params.enabled : true,
            schedule: schedule as JobCreate["schedule"],
            payload: payload as JobCreate["payload"],
            deleteAfterRun: typeof params.deleteAfterRun === "boolean" ? params.deleteAfterRun : undefined,
          });

          return { ok: true, result: job };
        }

        case "cron.update": {
          const jobId = resolveJobId(params);
          if (!jobId) {
            return fail({ code: "INVALID_REQUEST", message: "cron.update requires id or jobId" });
          }
          const patch = params.patch;
          if (!isRecord(patch)) {
            return fail({ code: "INVALID_REQUEST", message: "cron.update requires patch object" });
          }
          const updated = await deps.scheduler.update(jobId, patch as JobPatch);
          return { ok: true, result: updated };
        }

        case "cron.remove": {
          const jobId = resolveJobId(params);
          if (!jobId) {
            return fail({ code: "INVALID_REQUEST", message: "cron.remove requires id or jobId" });
          }
          const removed = await deps.scheduler.remove(jobId);
          return { ok: true, result: { removed } };
        }

        case "cron.run": {
          const jobId = resolveJobId(params);
          if (!jobId) {
            return fail({ code: "INVALID_REQUEST", message: "cron.run requires id or jobId" });
          }
          const mode = params.mode;
          if (mode !== undefined && mode !== "due" && mode !== "force") {
            return fail({ code: "INVALID_REQUEST", message: "cron.run mode must be due or force" });
          }
          const ran = await deps.scheduler.run(jobId, (mode as "due" | "force" | undefined) ?? "force");
          return { ok: true, result: { ran } };
        }

        case "cron.runs": {
          const jobId = resolveJobId(params);
          if (!jobId) {
            return fail({ code: "INVALID_REQUEST", message: "cron.runs requires id or jobId" });
          }
          const limit = params.limit;
          if (limit !== undefined && (typeof limit !== "number" || !Number.isFinite(limit))) {
            return fail({ code: "INVALID_REQUEST", message: "cron.runs limit must be a number" });
          }
          const entries = deps.cronRuns.list(jobId, limit as number | undefined);
          return { ok: true, result: { entries } };
        }

        case "skills.status": {
          const skills = deps.skillsService.list();
          const eligible = skills.filter((skill) => skill.eligible).length;
          const disabled = skills.filter((skill) => skill.disabled).length;
          return {
            ok: true,
            result: {
              total: skills.length,
              eligible,
              disabled,
              warning: deps.skillsService.getDangerWarning(),
              skills,
            },
          };
        }

        case "skills.search": {
          const query = typeof params.query === "string" ? params.query : undefined;
          const result = await deps.skillsService.searchRegistry(query);
          return { ok: true, result };
        }

        case "skills.bins": {
          const bins = deps.skillsService.bins();
          return { ok: true, result: { bins } };
        }

        case "skills.install": {
          const reference = typeof params.reference === "string"
            ? params.reference
            : typeof params.name === "string"
              ? params.name
              : "";
          if (!reference.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "skills.install requires reference" });
          }
          const agents = Array.isArray(params.agents)
            ? params.agents.filter((agent): agent is string => typeof agent === "string")
            : undefined;
          const result = await deps.skillsService.installFromRegistry(reference.trim(), {
            global: params.global !== false,
            agents,
          });
          if (!result.ok) {
            return fail({ code: "UNAVAILABLE", message: result.message || "skills install failed" });
          }
          return { ok: true, result };
        }

        case "skills.update": {
          const skillKey = params.skillKey;
          if (typeof skillKey !== "string" || !skillKey.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "skills.update requires skillKey" });
          }
          const enabled = params.enabled;
          if (typeof enabled !== "boolean") {
            return fail({ code: "INVALID_REQUEST", message: "skills.update requires enabled boolean" });
          }
          const skill = deps.skillsService.getByName(skillKey.trim());
          if (!skill) {
            return fail({ code: "INVALID_REQUEST", message: `unknown skill: ${skillKey}` });
          }
          deps.skillsService.toggle(skill.name, enabled);
          const updated = deps.skillsService.getByName(skill.name);
          return {
            ok: true,
            result: {
              ok: true,
              skillKey: skill.name,
              enabled,
              skill: updated,
            },
          };
        }

        case "channels.status": {
          const channelParam = params.channel;
          const requestedChannel = channelParam === undefined ? null : parseChannelId(channelParam);
          if (channelParam !== undefined && !requestedChannel) {
            return fail({ code: "INVALID_REQUEST", message: "channels.status requires a valid channel" });
          }

          const rows = requestedChannel
            ? (() => {
                const one = deps.channelManager.getStatus(requestedChannel);
                return one ? [one] : [];
              })()
            : deps.channelManager.listAll();

          if (requestedChannel && rows.length === 0) {
            return fail({ code: "INVALID_REQUEST", message: `unknown channel: ${requestedChannel}` });
          }

          const payload = {
            ts: Date.now(),
            channelOrder: rows.map((row) => row.config.channelId),
            channels: {} as Record<string, unknown>,
            channelAccounts: {} as Record<string, unknown>,
            channelDefaultAccountId: {} as Record<string, string>,
          };

          for (const row of rows) {
            const channelId = row.config.channelId;
            const configured = Boolean(row.config.token || row.config.extra);
            payload.channels[channelId] = {
              configured,
              connected: row.status.connected,
              error: row.status.error,
            };
            payload.channelAccounts[channelId] = [
              {
                accountId: DEFAULT_CHANNEL_ACCOUNT_ID,
                configured,
                connected: row.status.connected,
                accountName: row.status.accountName,
                error: row.status.error,
                qrDataUrl: row.status.qrDataUrl,
                lastConnectedAt: row.status.lastConnectedAt,
                lastDisconnectedAt: row.status.lastDisconnectedAt,
                lastErrorAt: row.status.lastErrorAt,
              },
            ];
            payload.channelDefaultAccountId[channelId] = DEFAULT_CHANNEL_ACCOUNT_ID;
          }

          return { ok: true, result: payload };
        }

        case "channels.logout": {
          const channelId = parseChannelId(params.channel);
          if (!channelId) {
            return fail({ code: "INVALID_REQUEST", message: "channels.logout requires a valid channel" });
          }

          const accountId = typeof params.accountId === "string" && params.accountId.trim()
            ? params.accountId.trim()
            : DEFAULT_CHANNEL_ACCOUNT_ID;

          const existing = deps.channelManager.getStatus(channelId);
          if (!existing) {
            return fail({ code: "INVALID_REQUEST", message: `unknown channel: ${channelId}` });
          }

          try {
            await deps.channelManager.stopChannel(channelId);
          } catch {
            // Continue logout flow even if channel was not started.
          }

          await deps.channelManager.updateConfig(channelId, {
            enabled: false,
            token: undefined,
          });

          return {
            ok: true,
            result: {
              channel: channelId,
              accountId,
              cleared: true,
              loggedOut: true,
            },
          };
        }

        case "browser.request": {
          const action = params.action;
          if (typeof action !== "string" || !action.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "browser.request requires action" });
          }

          const browser = deps.browserService;
          switch (action) {
            case "navigate": {
              if (typeof params.url !== "string" || !params.url.trim()) {
                return fail({ code: "INVALID_REQUEST", message: "browser navigate requires url" });
              }
              const message = await browser.navigate(params.url);
              return { ok: true, result: { message } };
            }
            case "click": {
              if (typeof params.selector !== "string" || !params.selector.trim()) {
                return fail({ code: "INVALID_REQUEST", message: "browser click requires selector" });
              }
              const message = await browser.click(params.selector);
              return { ok: true, result: { message } };
            }
            case "type": {
              if (typeof params.selector !== "string" || !params.selector.trim()) {
                return fail({ code: "INVALID_REQUEST", message: "browser type requires selector" });
              }
              if (typeof params.text !== "string") {
                return fail({ code: "INVALID_REQUEST", message: "browser type requires text" });
              }
              const message = await browser.type(params.selector, params.text);
              return { ok: true, result: { message } };
            }
            case "screenshot": {
              const fullPage = params.fullPage === true;
              const imageBase64 = await browser.screenshot({ fullPage });
              return { ok: true, result: { imageBase64 } };
            }
            case "evaluate": {
              if (typeof params.script !== "string" || !params.script.trim()) {
                return fail({ code: "INVALID_REQUEST", message: "browser evaluate requires script" });
              }
              const result = await browser.evaluate(params.script);
              return { ok: true, result: { result } };
            }
            case "text": {
              const text = await browser.getText();
              return { ok: true, result: { text } };
            }
            case "tabs": {
              const tabs = await browser.tabs();
              return { ok: true, result: { tabs } };
            }
            case "openTab": {
              const tab = await browser.openTab(typeof params.url === "string" ? params.url : undefined);
              return { ok: true, result: { tab } };
            }
            case "closeTab": {
              if (typeof params.index !== "number" || !Number.isInteger(params.index)) {
                return fail({ code: "INVALID_REQUEST", message: "browser closeTab requires integer index" });
              }
              const message = await browser.closeTab(params.index);
              return { ok: true, result: { message } };
            }
            case "focusTab": {
              if (typeof params.index !== "number" || !Number.isInteger(params.index)) {
                return fail({ code: "INVALID_REQUEST", message: "browser focusTab requires integer index" });
              }
              const message = await browser.focusTab(params.index);
              return { ok: true, result: { message } };
            }
            case "snapshot": {
              const snapshot = await browser.snapshot();
              return { ok: true, result: { snapshot } };
            }
            case "pdf": {
              const outputPath = typeof params.outputPath === "string" ? params.outputPath : undefined;
              const path = await browser.pdf(outputPath);
              return { ok: true, result: { path } };
            }
            case "armDialog": {
              if (typeof params.accept !== "boolean") {
                return fail({ code: "INVALID_REQUEST", message: "browser armDialog requires accept boolean" });
              }
              const promptText = typeof params.promptText === "string" ? params.promptText : undefined;
              const message = await browser.armDialog(params.accept, promptText);
              return { ok: true, result: { message } };
            }
            case "uploadFile": {
              if (typeof params.selector !== "string" || !params.selector.trim()) {
                return fail({ code: "INVALID_REQUEST", message: "browser uploadFile requires selector" });
              }
              if (!Array.isArray(params.paths) || !params.paths.every((p) => typeof p === "string")) {
                return fail({ code: "INVALID_REQUEST", message: "browser uploadFile requires paths string[]" });
              }
              const message = await browser.uploadFile(params.selector, params.paths as string[]);
              return { ok: true, result: { message } };
            }
            case "waitForSelector": {
              if (typeof params.selector !== "string" || !params.selector.trim()) {
                return fail({ code: "INVALID_REQUEST", message: "browser waitForSelector requires selector" });
              }
              const timeout = typeof params.timeout === "number" ? params.timeout : undefined;
              const message = await browser.waitForSelector(params.selector, timeout);
              return { ok: true, result: { message } };
            }
            case "scroll": {
              if (typeof params.x !== "number" || typeof params.y !== "number") {
                return fail({ code: "INVALID_REQUEST", message: "browser scroll requires x and y numbers" });
              }
              const message = await browser.scroll(params.x, params.y);
              return { ok: true, result: { message } };
            }
            case "setHeadless": {
              if (typeof params.value !== "boolean") {
                return fail({ code: "INVALID_REQUEST", message: "browser setHeadless requires value boolean" });
              }
              await browser.setHeadless(params.value);
              return { ok: true, result: { headless: browser.isHeadless() } };
            }
            case "isHeadless": {
              return { ok: true, result: { headless: browser.isHeadless() } };
            }
            default:
              return fail({ code: "INVALID_REQUEST", message: `unknown browser action: ${action}` });
          }
        }

        case "exec.approval.request": {
          if (typeof params.command !== "string" || !params.command.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "exec.approval.request requires command" });
          }

          const timeoutMs = typeof params.timeoutMs === "number" ? params.timeoutMs : 120_000;
          const explicitId = typeof params.id === "string" && params.id.trim() ? params.id.trim() : undefined;

          if (explicitId && deps.execApprovalService.getSnapshot(explicitId)) {
            return fail({ code: "INVALID_REQUEST", message: "approval id already pending" });
          }

          const record = deps.execApprovalService.create(
            {
              command: params.command,
              cwd: typeof params.cwd === "string" ? params.cwd : null,
              host: typeof params.host === "string" ? params.host : null,
              security: typeof params.security === "string" ? params.security : null,
              ask: typeof params.ask === "string" ? params.ask : null,
              agentId: typeof params.agentId === "string" ? params.agentId : null,
              resolvedPath: typeof params.resolvedPath === "string" ? params.resolvedPath : null,
              sessionKey: typeof params.sessionKey === "string" ? params.sessionKey : null,
            },
            timeoutMs,
            explicitId,
          );

          const shouldAwait = params.await !== false;
          if (!shouldAwait) {
            return {
              ok: true,
              result: {
                id: record.id,
                pending: true,
                createdAtMs: record.createdAtMs,
                expiresAtMs: record.expiresAtMs,
              },
            };
          }

          const decision = await deps.execApprovalService.waitForDecision(record.id);
          return {
            ok: true,
            result: {
              id: record.id,
              decision,
              createdAtMs: record.createdAtMs,
              expiresAtMs: record.expiresAtMs,
            },
          };
        }

        case "exec.approval.resolve": {
          if (typeof params.id !== "string" || !params.id.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "exec.approval.resolve requires id" });
          }
          const decision = params.decision;
          if (decision !== "allow-once" && decision !== "allow-always" && decision !== "deny") {
            return fail({ code: "INVALID_REQUEST", message: "invalid decision" });
          }

          const ok = deps.execApprovalService.resolve(params.id.trim(), decision as ExecApprovalDecision);
          if (!ok) {
            return fail({ code: "INVALID_REQUEST", message: "unknown approval id" });
          }

          return { ok: true, result: { ok: true } };
        }

        case "node.pair.request": {
          const nodeId = resolveNodeId(params);
          if (!nodeId) {
            return fail({ code: "INVALID_REQUEST", message: "node.pair.request requires nodeId" });
          }
          const connector = params.connector !== undefined ? parseConnectorConfig(params.connector) : null;
          if (params.connector !== undefined && !connector) {
            return fail({ code: "INVALID_REQUEST", message: "invalid connector config" });
          }
          const result = deps.nodeGatewayService.requestPairing({
            nodeId,
            displayName: typeof params.displayName === "string" ? params.displayName : undefined,
            platform: typeof params.platform === "string" ? params.platform : undefined,
            caps: Array.isArray(params.caps) ? params.caps.filter((v): v is string => typeof v === "string") : undefined,
            commands: Array.isArray(params.commands) ? params.commands.filter((v): v is string => typeof v === "string") : undefined,
            connector: connector ?? undefined,
          });
          return { ok: true, result };
        }

        case "node.pair.list": {
          const result = deps.nodeGatewayService.listPairing();
          return { ok: true, result };
        }

        case "node.pair.approve":
        case "device.pair.approve": {
          const requestId = typeof params.requestId === "string" ? params.requestId.trim() : "";
          if (!requestId) {
            return fail({ code: "INVALID_REQUEST", message: `${method} requires requestId` });
          }
          const approved = deps.nodeGatewayService.approvePairing(requestId);
          if (!approved) {
            return fail({ code: "INVALID_REQUEST", message: "unknown requestId" });
          }
          let connectedNode: unknown = null;
          if (approved.connector) {
            const connector = await deps.connectorRegistry.add(approved.connector);
            connectedNode = connector.info();
          }
          return {
            ok: true,
            result: {
              requestId,
              node: approved.node,
              connectedNode,
            },
          };
        }

        case "node.pair.reject":
        case "device.pair.reject": {
          const requestId = typeof params.requestId === "string" ? params.requestId.trim() : "";
          if (!requestId) {
            return fail({ code: "INVALID_REQUEST", message: `${method} requires requestId` });
          }
          const rejected = deps.nodeGatewayService.rejectPairing(requestId);
          if (!rejected) {
            return fail({ code: "INVALID_REQUEST", message: "unknown requestId" });
          }
          return { ok: true, result: rejected };
        }

        case "node.pair.verify": {
          const nodeId = resolveNodeId(params);
          if (!nodeId) {
            return fail({ code: "INVALID_REQUEST", message: "node.pair.verify requires nodeId" });
          }
          const token = typeof params.token === "string" ? params.token : "";
          if (!token.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "node.pair.verify requires token" });
          }
          const result = deps.nodeGatewayService.verifyToken(nodeId, token);
          return { ok: true, result };
        }

        case "device.pair.list": {
          const result = deps.nodeGatewayService.listPairing();
          return {
            ok: true,
            result: {
              pending: result.requests,
              paired: result.paired,
            },
          };
        }

        case "device.token.rotate": {
          const nodeId = resolveNodeId(params);
          if (!nodeId) {
            return fail({ code: "INVALID_REQUEST", message: "device.token.rotate requires nodeId" });
          }
          const rotated = deps.nodeGatewayService.rotateToken(nodeId);
          if (!rotated) {
            return fail({ code: "INVALID_REQUEST", message: "unknown nodeId" });
          }
          return { ok: true, result: rotated };
        }

        case "device.token.revoke": {
          const nodeId = resolveNodeId(params);
          if (!nodeId) {
            return fail({ code: "INVALID_REQUEST", message: "device.token.revoke requires nodeId" });
          }
          const revoked = deps.nodeGatewayService.revokeToken(nodeId);
          if (!revoked) {
            return fail({ code: "INVALID_REQUEST", message: "unknown nodeId" });
          }
          return { ok: true, result: revoked };
        }

        case "node.rename": {
          const nodeId = resolveNodeId(params);
          if (!nodeId) {
            return fail({ code: "INVALID_REQUEST", message: "node.rename requires nodeId" });
          }
          const displayName = typeof params.displayName === "string" ? params.displayName.trim() : "";
          if (!displayName) {
            return fail({ code: "INVALID_REQUEST", message: "node.rename requires displayName" });
          }
          const renamed = deps.nodeGatewayService.renameNode(nodeId, displayName);
          if (!renamed) {
            return fail({ code: "INVALID_REQUEST", message: "unknown nodeId" });
          }
          return { ok: true, result: renamed };
        }

        case "node.list": {
          const pairing = deps.nodeGatewayService.listPairing();
          const pairedById = new Map(pairing.paired.map((entry) => [entry.nodeId, entry]));
          const connected = deps.connectorRegistry.listConnected();
          const allIds = new Set<string>([
            ...pairedById.keys(),
            ...connected.map((entry) => entry.nodeId),
          ]);

          const nodes = [...allIds].map((nodeId) => {
            const paired = pairedById.get(nodeId);
            const live = connected.find((entry) => entry.nodeId === nodeId);
            return {
              nodeId,
              displayName: live?.displayName ?? paired?.displayName,
              platform: live?.platform ?? paired?.platform,
              caps: live?.capabilities ?? paired?.caps ?? [],
              commands: live?.commands ?? paired?.commands ?? [],
              connectedAtMs: live?.connectedAt,
              paired: Boolean(paired),
              connected: Boolean(live),
            };
          });

          return { ok: true, result: { ts: Date.now(), nodes } };
        }

        case "node.describe": {
          const nodeId = resolveNodeId(params);
          if (!nodeId) {
            return fail({ code: "INVALID_REQUEST", message: "node.describe requires nodeId" });
          }
          const paired = deps.nodeGatewayService.getPaired(nodeId);
          const live = deps.connectorRegistry.get(nodeId)?.info();
          if (!paired && !live) {
            return fail({ code: "INVALID_REQUEST", message: "unknown nodeId" });
          }
          return {
            ok: true,
            result: {
              ts: Date.now(),
              nodeId,
              displayName: live?.displayName ?? paired?.displayName,
              platform: live?.platform ?? paired?.platform,
              caps: live?.capabilities ?? paired?.caps ?? [],
              commands: live?.commands ?? paired?.commands ?? [],
              paired: Boolean(paired),
              connected: Boolean(live?.connected),
            },
          };
        }

        case "node.invoke": {
          const nodeId = resolveNodeId(params);
          if (!nodeId) {
            return fail({ code: "INVALID_REQUEST", message: "node.invoke requires nodeId" });
          }
          const command = typeof params.command === "string" ? params.command.trim() : "";
          if (!command) {
            return fail({ code: "INVALID_REQUEST", message: "node.invoke requires command" });
          }
          const invokeId = typeof params.idempotencyKey === "string" && params.idempotencyKey.trim()
            ? params.idempotencyKey.trim()
            : randomUUID();
          const result = await deps.connectorRegistry.invoke(nodeId, command, params.params);
          deps.nodeGatewayService.recordInvokeResult({
            id: invokeId,
            nodeId,
            ok: result.ok,
            payload: result.payload,
            error: result.error,
          });
          return {
            ok: true,
            result: {
              id: invokeId,
              nodeId,
              command,
              ok: result.ok,
              payload: result.payload,
              error: result.error,
            },
          };
        }

        case "node.invoke.result": {
          const id = typeof params.id === "string" ? params.id.trim() : "";
          const nodeId = resolveNodeId(params);
          if (!id || !nodeId) {
            return fail({ code: "INVALID_REQUEST", message: "node.invoke.result requires id and nodeId" });
          }
          const ok = params.ok === true;
          deps.nodeGatewayService.recordInvokeResult({
            id,
            nodeId,
            ok,
            payload: params.payload,
            error: params.error,
          });
          return { ok: true, result: { ok: true } };
        }

        case "node.event": {
          const nodeId = resolveNodeId(params) ?? "node";
          const event = typeof params.event === "string" ? params.event.trim() : "";
          if (!event) {
            return fail({ code: "INVALID_REQUEST", message: "node.event requires event" });
          }
          deps.nodeGatewayService.recordNodeEvent({
            nodeId,
            event,
            payload: params.payload,
            ts: Date.now(),
          });
          return { ok: true, result: { ok: true } };
        }

        case "chat.history": {
          const rawSessionId = params.sessionId;
          if (rawSessionId !== undefined && typeof rawSessionId !== "string") {
            return fail({ code: "INVALID_REQUEST", message: "chat.history requires sessionId as string" });
          }
          const sessionId = rawSessionId ?? "default";
          const messages = await deps.chatService.getHistory(sessionId);
          return { ok: true, result: { sessionId, messages } };
        }

        case "chat.send": {
          const sessionId = typeof params.sessionId === "string" && params.sessionId.trim()
            ? params.sessionId.trim()
            : "default";
          const text = typeof params.text === "string"
            ? params.text
            : typeof params.message === "string"
              ? params.message
              : typeof params.input === "string"
                ? params.input
                : "";
          if (!text.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "chat.send requires text" });
          }
          await deps.chatService.addUserMessage(sessionId, text);
          abortedSessions.delete(sessionId);
          return {
            ok: true,
            result: {
              sessionId,
              accepted: true,
              queued: false,
            },
          };
        }

        case "chat.abort": {
          const sessionId = typeof params.sessionId === "string" ? params.sessionId.trim() : "";
          if (!sessionId) {
            return fail({ code: "INVALID_REQUEST", message: "chat.abort requires sessionId" });
          }
          abortedSessions.add(sessionId);
          return { ok: true, result: { sessionId, aborted: true } };
        }

        case "send": {
          const text = typeof params.text === "string"
            ? params.text
            : typeof params.message === "string"
              ? params.message
              : "";
          if (!text.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "send requires text" });
          }
          const channel = typeof params.channel === "string" ? params.channel.trim() : "default";
          const sessionId = typeof params.sessionId === "string" && params.sessionId.trim()
            ? params.sessionId.trim()
            : `send-${channel}`;
          await deps.chatService.addUserMessage(sessionId, text);
          return { ok: true, result: { ok: true, channel, sessionId } };
        }

        case "agent": {
          const input = typeof params.input === "string"
            ? params.input
            : typeof params.instruction === "string"
              ? params.instruction
              : typeof params.message === "string"
                ? params.message
                : "";
          if (!input.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "agent requires input" });
          }
          const agentId = typeof params.agentId === "string" && params.agentId.trim() ? params.agentId.trim() : "default";
          const sessionId = typeof params.sessionId === "string" && params.sessionId.trim() ? params.sessionId.trim() : `agent-${agentId}`;
          await deps.chatService.addUserMessage(sessionId, input);
          abortedSessions.delete(sessionId);
          return { ok: true, result: { accepted: true, sessionId, agentId } };
        }

        case "agent.wait": {
          const sessionId = typeof params.sessionId === "string" ? params.sessionId.trim() : "";
          if (!sessionId) {
            return fail({ code: "INVALID_REQUEST", message: "agent.wait requires sessionId" });
          }
          const messages = await deps.chatService.getHistory(sessionId);
          const aborted = abortedSessions.has(sessionId);
          return { ok: true, result: { sessionId, done: !aborted, aborted, messages } };
        }

        case "wizard.start": {
          const result = await deps.wizardService.start(params);
          return { ok: true, result };
        }

        case "wizard.next": {
          const sessionId = params.sessionId;
          if (typeof sessionId !== "string" || !sessionId.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "wizard.next requires sessionId" });
          }
          const answer = params.answer;
          if (answer !== undefined && !isRecord(answer)) {
            return fail({ code: "INVALID_REQUEST", message: "wizard.next answer must be an object" });
          }
          const result = await deps.wizardService.next(sessionId, answer as WizardAnswer | undefined);
          return { ok: true, result };
        }

        case "wizard.cancel": {
          const sessionId = params.sessionId;
          if (typeof sessionId !== "string" || !sessionId.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "wizard.cancel requires sessionId" });
          }
          const result = deps.wizardService.cancel(sessionId);
          return { ok: true, result };
        }

        case "wizard.status": {
          const sessionId = params.sessionId;
          if (typeof sessionId !== "string" || !sessionId.trim()) {
            return fail({ code: "INVALID_REQUEST", message: "wizard.status requires sessionId" });
          }
          const result = deps.wizardService.status(sessionId);
          return { ok: true, result };
        }

        default:
          return fail({ code: "METHOD_NOT_FOUND", message: `Unknown method: ${method}` });
      }
    } catch (err) {
      const message = toErrorMessage(err);
      const code: GatewayMethodCode = /wizard|cron|skills|channels|browser|exec|node|device|usage|config|voicewake|identity|session|heartbeat|presence|event|chat|send|model|talk|update|logs|tts|agents|files|required|invalid|not found|unknown job id|unknown channel|unknown approval id|unknown nodeid|requestid|agent/i.test(message)
        ? "INVALID_REQUEST"
        : "UNAVAILABLE";
      return fail({ code, message });
    }
  });
}
