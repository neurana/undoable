import { randomBytes, randomUUID } from "node:crypto";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import os from "node:os";
import type { EventBus } from "@undoable/core";
import type { ChatService } from "../services/chat-service.js";
import type { ToolRegistry } from "../tools/index.js";
import type { CallLLMFn } from "../services/run-executor.js";
import type { MediaService } from "../services/media-service.js";
import type { MediaUnderstandingService } from "../services/media-understanding.js";
import type { Channel, ChannelConfig, ChannelId, ChannelMessage, ChannelStatus } from "./types.js";
import { RateLimiter, shouldAcceptMessage, isMediaWithinLimit, MessageQueue } from "./channel-utils.js";
import { parseDirectives } from "../services/directive-parser.js";

const CONFIG_PATH = path.join(os.homedir(), ".undoable", "channels.json");
const PAIRING_STATE_PATH = path.join(os.homedir(), ".undoable", "channel-pairing.json");
const DEFAULT_LOG_LIMIT = 200;
const MAX_LOG_ENTRIES = 2000;
const PAIRING_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PAIRING_PROMPT_COOLDOWN_MS = 2 * 60 * 1000;

const CHANNEL_SYSTEM_PROMPT = [
  "You are Undoable, an AI assistant responding via a messaging channel.",
  "Keep responses concise and conversational - this is a chat platform, not a code editor.",
  "Format responses as plain text (no markdown) unless the platform supports it.",
  "",
  "Capability grounding:",
  "- Treat listed tools as available. Do not claim a capability is unavailable until a relevant tool call fails.",
  "- Prefer Undoable-native tooling over external platforms unless the user explicitly asks for external tools.",
  "- If a tool fails, report what failed, why (exact blocker), and one concrete recovery step.",
  "",
  "You have full access to the user's system via tools:",
  "- web_search: Search the web. Use this when asked to find, research, or look up anything.",
  "- browse_page / web_fetch: Read a specific URL or make HTTP requests.",
  "- browser: Full browser control (navigate, click, type, screenshot, etc.).",
  "- exec: Run shell commands on the user's system.",
  "- read_file / write_file / edit_file: File operations.",
  "- project_info / file_info / codebase_search: Understand codebases.",
  "- skills_list / skills_search / skills_install / skills_remove / skills_toggle: Discover and manage skills.sh skills from inside Undoable.",
  "- telegram_actions / discord_actions / slack_actions / whatsapp_actions: Perform actions on messaging platforms.",
  "- sessions_list / sessions_history / sessions_send / sessions_spawn: Interact with other sessions.",
  "- media: Download, inspect, resize, describe (image->text), transcribe (audio->text) media files.",
  "- undo / actions: Inspect action history, undo/redo changes, and report reliability status.",
  "",
  "Automation policy:",
  "- For requests like automation/workflow/SDR/24-7 agent, propose or execute an Undoable-native workflow first.",
  "- Do not default to external services (Zapier/Make/n8n) unless the user explicitly asks for those.",
  "- If a platform has no dedicated tool (for example email/Gmail), implement via exec/web_fetch inside Undoable and ask only for missing credentials.",
  "",
  "Execution policy:",
  "- Act immediately when asked; ask clarifying questions only when blocked (missing credentials/IDs or ambiguous intent).",
  "- For mutating tasks, prefer undoable flows (write_file/edit_file). Use undo list when the user asks for audit/reliability checks.",
  "- Verify user-visible outputs before claiming success (for example, read files after writing).",
].join("\n");

type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";
type ResolveKind = "auto" | "user" | "group";

type PairingStatus = "pending" | "approved" | "rejected" | "expired";

export type ChannelLogEntry = {
  id: string;
  ts: number;
  channelId: ChannelId;
  level: "info" | "warn" | "error";
  event: string;
  message: string;
  meta?: Record<string, unknown>;
};

export type ChannelCapability = {
  channelId: ChannelId;
  name: string;
  auth: string[];
  supports: string[];
  toolActions: string[];
  notes: string[];
};

export type ChannelProbeCheck = {
  name: string;
  ok: boolean;
  severity: "info" | "warn" | "error";
  message: string;
};

export type ChannelProbeResult = {
  channelId: ChannelId;
  probedAt: number;
  connected: boolean;
  ok: boolean;
  checks: ChannelProbeCheck[];
};

export type ChannelResolveEntry = {
  input: string;
  resolved: string | null;
  type: "user" | "group" | "unknown";
  confidence: "high" | "medium" | "low";
  note?: string;
};

export type ChannelPairingRequest = {
  requestId: string;
  channelId: ChannelId;
  userId: string;
  chatId: string;
  code: string;
  status: PairingStatus;
  createdAt: number;
  updatedAt: number;
  lastPromptAt?: number;
  promptCount: number;
  resolvedAt?: number;
  resolvedBy?: string;
};

export type ChannelPairingApproval = {
  channelId: ChannelId;
  userId: string;
  approvedAt: number;
  requestId?: string;
  approvedBy?: string;
};

export type ChannelPairingListResult = {
  pending: ChannelPairingRequest[];
  approved: ChannelPairingApproval[];
  recent: ChannelPairingRequest[];
};

type PairingStateFile = {
  version: 1;
  requests: ChannelPairingRequest[];
  approvals: ChannelPairingApproval[];
};

const CHANNEL_CAPABILITIES: Record<ChannelId, ChannelCapability> = {
  telegram: {
    channelId: "telegram",
    name: "Telegram",
    auth: ["bot_token"],
    supports: ["dm", "groups", "threads", "pairing_policy", "allowlist", "live_probe"],
    toolActions: ["send_message", "edit_message", "delete_message", "react", "read_history", "pin"],
    notes: ["Uses @BotFather token.", "Pairing policy works for direct messages."],
  },
  discord: {
    channelId: "discord",
    name: "Discord",
    auth: ["bot_token"],
    supports: ["dm", "groups", "mentions", "moderation_actions", "pairing_policy", "allowlist", "live_probe"],
    toolActions: [
      "send_message",
      "edit_message",
      "delete_message",
      "react",
      "read_history",
      "member_info",
      "role_add",
      "role_remove",
      "timeout",
      "kick",
      "ban",
      "channel_list",
    ],
    notes: ["Requires Message Content intent.", "For guild flows, mention/reply routing is enforced."],
  },
  slack: {
    channelId: "slack",
    name: "Slack",
    auth: ["bot_token", "app_token"],
    supports: ["dm", "groups", "threads", "pairing_policy", "allowlist", "live_probe"],
    toolActions: ["send_message", "edit_message", "delete_message", "react", "read_history", "pin", "unpin"],
    notes: ["Socket mode requires xoxb + xapp.", "Pairing policy applies to direct messages."],
  },
  whatsapp: {
    channelId: "whatsapp",
    name: "WhatsApp",
    auth: ["qr_login"],
    supports: ["dm", "groups", "qr_login", "pairing_policy", "allowlist"],
    toolActions: ["send_message"],
    notes: ["Uses QR linking (no static token).", "DM pairing prompts can be approved from CLI."],
  },
};

function parseDmPolicy(value: unknown): DmPolicy | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "pairing" || normalized === "allowlist" || normalized === "open" || normalized === "disabled") {
    return normalized;
  }
  return undefined;
}

function parseUserList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((entry) => String(entry).trim())
    .filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : [];
}

function normalizeUserList(value: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) return value;
  return [...new Set(value.map((entry) => String(entry).trim()).filter(Boolean))];
}

function normalizeResolveKind(value: unknown): ResolveKind {
  if (value === "user" || value === "group") return value;
  return "auto";
}

function nowMs(): number {
  return Date.now();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export type ChannelManagerDeps = {
  chatService: ChatService;
  eventBus: EventBus;
  callLLM: CallLLMFn;
  registry: ToolRegistry;
  mediaService?: MediaService;
  mediaUnderstanding?: MediaUnderstandingService;
};

export class ChannelManager {
  private channels = new Map<ChannelId, Channel>();
  private configs = new Map<ChannelId, ChannelConfig>();
  private deps: ChannelManagerDeps;
  private rateLimiters = new Map<ChannelId, RateLimiter>();
  private messageQueue: MessageQueue;
  private logs: ChannelLogEntry[] = [];
  private pairingRequests = new Map<string, ChannelPairingRequest>();
  private pairingApprovals = new Map<string, ChannelPairingApproval>();

  constructor(deps: ChannelManagerDeps) {
    this.deps = deps;
    this.messageQueue = new MessageQueue((msg) => this.processInbound(msg), { debounceMs: 300 });
  }

  private normalizeConfig(config: ChannelConfig): ChannelConfig {
    const next: ChannelConfig = {
      ...config,
      userAllowlist: normalizeUserList(config.userAllowlist),
      userBlocklist: normalizeUserList(config.userBlocklist),
    };

    const extra = config.extra;
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) {
      return next;
    }

    const dmPolicy = parseDmPolicy((extra as Record<string, unknown>).dmPolicy);
    const extraAllowlist = parseUserList((extra as Record<string, unknown>).allowlist);

    if (next.allowDMs === undefined && dmPolicy) {
      next.allowDMs = dmPolicy !== "disabled";
    }

    if (next.userAllowlist === undefined && dmPolicy === "allowlist" && extraAllowlist) {
      next.userAllowlist = extraAllowlist;
    }

    return next;
  }

  private resolveDmPolicy(config: ChannelConfig | undefined): DmPolicy {
    if (!config) return "pairing";
    const fromExtra = parseDmPolicy((config.extra as Record<string, unknown> | undefined)?.dmPolicy);
    if (fromExtra) return fromExtra;
    if (config.allowDMs === false) return "disabled";
    if (Array.isArray(config.userAllowlist) && config.userAllowlist.length > 0) return "allowlist";
    return "pairing";
  }

  private shouldAutoStart(config: ChannelConfig): boolean {
    if (!config.enabled) return false;
    if (config.channelId === "whatsapp") return true;
    if (config.channelId === "slack") {
      const appToken = config.extra && typeof config.extra === "object" && !Array.isArray(config.extra)
        ? (config.extra as Record<string, unknown>).appToken
        : undefined;
      return Boolean(config.token && typeof appToken === "string" && appToken.trim().length > 0);
    }
    return Boolean(config.token);
  }

  private getRateLimiter(channelId: ChannelId): RateLimiter {
    let rl = this.rateLimiters.get(channelId);
    if (!rl) {
      const config = this.configs.get(channelId);
      rl = new RateLimiter({ maxPerMinute: config?.rateLimit ?? 20 });
      this.rateLimiters.set(channelId, rl);
    }
    return rl;
  }

  private pairingKey(channelId: ChannelId, userId: string): string {
    return `${channelId}:${userId}`;
  }

  private normalizePairingCode(value: string): string {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  private generatePairingCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = randomBytes(6);
    let code = "";
    for (let i = 0; i < 6; i++) {
      const byte = bytes.at(i) ?? 0;
      code += alphabet[byte % alphabet.length];
    }
    return code;
  }

  private pushChannelLog(entry: Omit<ChannelLogEntry, "id" | "ts">): ChannelLogEntry {
    const row: ChannelLogEntry = {
      id: randomUUID(),
      ts: nowMs(),
      ...entry,
    };
    this.logs.push(row);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES);
    }
    return row;
  }

  private async loadPairingState(): Promise<void> {
    try {
      const raw = await fsp.readFile(PAIRING_STATE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as PairingStateFile;
      if (!parsed || parsed.version !== 1) return;

      this.pairingRequests.clear();
      this.pairingApprovals.clear();

      for (const request of parsed.requests ?? []) {
        if (!request?.requestId) continue;
        this.pairingRequests.set(request.requestId, request);
      }

      for (const approval of parsed.approvals ?? []) {
        if (!approval?.channelId || !approval?.userId) continue;
        this.pairingApprovals.set(this.pairingKey(approval.channelId, approval.userId), approval);
      }

      this.expirePairingRequests();
    } catch {
      // No pairing state yet.
    }
  }

  private async savePairingState(): Promise<void> {
    await fsp.mkdir(path.dirname(PAIRING_STATE_PATH), { recursive: true });
    const requests = [...this.pairingRequests.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 500);
    const approvals = [...this.pairingApprovals.values()]
      .sort((a, b) => b.approvedAt - a.approvedAt)
      .slice(0, 1000);
    const payload: PairingStateFile = {
      version: 1,
      requests,
      approvals,
    };
    await fsp.writeFile(PAIRING_STATE_PATH, JSON.stringify(payload, null, 2), "utf-8");
  }

  private queuePairingStateSave(): void {
    void this.savePairingState().catch(() => {
      // Best effort persistence.
    });
  }

  private expirePairingRequests(now = nowMs()): void {
    let mutated = false;
    for (const request of this.pairingRequests.values()) {
      if (request.status !== "pending") continue;
      if (now - request.createdAt <= PAIRING_REQUEST_TTL_MS) continue;
      request.status = "expired";
      request.updatedAt = now;
      request.resolvedAt = now;
      mutated = true;
    }
    if (mutated) this.queuePairingStateSave();
  }

  private findPendingPairingByUser(channelId: ChannelId, userId: string): ChannelPairingRequest | undefined {
    this.expirePairingRequests();
    for (const request of this.pairingRequests.values()) {
      if (request.channelId !== channelId) continue;
      if (request.userId !== userId) continue;
      if (request.status !== "pending") continue;
      return request;
    }
    return undefined;
  }

  private findPendingPairingByCode(channelId: ChannelId, code: string): ChannelPairingRequest | undefined {
    const target = this.normalizePairingCode(code);
    this.expirePairingRequests();
    for (const request of this.pairingRequests.values()) {
      if (request.channelId !== channelId) continue;
      if (request.status !== "pending") continue;
      if (request.code !== target) continue;
      return request;
    }
    return undefined;
  }

  private isPairingApproved(channelId: ChannelId, userId: string): boolean {
    return this.pairingApprovals.has(this.pairingKey(channelId, userId));
  }

  private isUserAllowlisted(config: ChannelConfig | undefined, userId: string): boolean {
    if (!config?.userAllowlist || config.userAllowlist.length === 0) return false;
    return config.userAllowlist.includes(userId);
  }

  private ensurePairingRequest(msg: ChannelMessage): ChannelPairingRequest {
    const existing = this.findPendingPairingByUser(msg.channelId, msg.from);
    if (existing) return existing;

    const request: ChannelPairingRequest = {
      requestId: randomUUID(),
      channelId: msg.channelId,
      userId: msg.from,
      chatId: msg.to,
      code: this.generatePairingCode(),
      status: "pending",
      createdAt: nowMs(),
      updatedAt: nowMs(),
      promptCount: 0,
    };

    this.pairingRequests.set(request.requestId, request);
    this.queuePairingStateSave();
    this.pushChannelLog({
      channelId: msg.channelId,
      level: "info",
      event: "pairing_request_created",
      message: `Created pairing request for ${msg.from}`,
      meta: {
        requestId: request.requestId,
        code: request.code,
      },
    });

    return request;
  }

  private async maybeSendPairingPrompt(msg: ChannelMessage, request: ChannelPairingRequest): Promise<void> {
    const channel = this.channels.get(msg.channelId);
    if (!channel) return;

    const now = nowMs();
    if (request.lastPromptAt && now - request.lastPromptAt < PAIRING_PROMPT_COOLDOWN_MS) {
      return;
    }

    request.lastPromptAt = now;
    request.promptCount += 1;
    request.updatedAt = now;
    this.queuePairingStateSave();

    const text = [
      "Pairing required before I can process your messages.",
      `Code: ${request.code}`,
      `Ask the owner to approve with: nrn pairing approve --channel ${msg.channelId} --code ${request.code}`,
    ].join("\n");

    try {
      await channel.send(msg.to, text, { threadId: msg.threadId });
      this.pushChannelLog({
        channelId: msg.channelId,
        level: "info",
        event: "pairing_prompt_sent",
        message: `Sent pairing prompt to ${msg.from}`,
        meta: { requestId: request.requestId, promptCount: request.promptCount },
      });
    } catch (err) {
      this.pushChannelLog({
        channelId: msg.channelId,
        level: "warn",
        event: "pairing_prompt_failed",
        message: `Failed to send pairing prompt to ${msg.from}`,
        meta: { requestId: request.requestId, error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  private shouldAcceptByPolicy(msg: ChannelMessage, config: ChannelConfig | undefined): { accept: boolean; reason?: string } {
    if (msg.chatType !== "direct") return { accept: true };

    const policy = this.resolveDmPolicy(config);
    if (policy === "open") return { accept: true };

    if (policy === "disabled") {
      return { accept: false, reason: "dm_disabled" };
    }

    if (policy === "allowlist") {
      if (this.isUserAllowlisted(config, msg.from)) return { accept: true };
      return { accept: false, reason: "dm_allowlist_blocked" };
    }

    if (this.isUserAllowlisted(config, msg.from)) return { accept: true };
    if (this.isPairingApproved(msg.channelId, msg.from)) return { accept: true };

    const request = this.ensurePairingRequest(msg);
    void this.maybeSendPairingPrompt(msg, request);
    return { accept: false, reason: "pairing_required" };
  }

  private buildEffectiveFilter(config: ChannelConfig | undefined, policy: DmPolicy): {
    allowDMs: boolean;
    allowGroups: boolean;
    userAllowlist?: string[];
    userBlocklist?: string[];
  } {
    return {
      allowDMs: config?.allowDMs ?? true,
      allowGroups: config?.allowGroups ?? true,
      userAllowlist: policy === "allowlist" ? config?.userAllowlist : undefined,
      userBlocklist: config?.userBlocklist,
    };
  }

  register(channel: Channel): void {
    this.channels.set(channel.id, channel);
  }

  getChannel(id: ChannelId): Channel | undefined {
    return this.channels.get(id);
  }

  async loadConfigs(): Promise<void> {
    try {
      const raw = await fsp.readFile(CONFIG_PATH, "utf-8");
      const configs = JSON.parse(raw) as ChannelConfig[];
      for (const c of configs) this.configs.set(c.channelId, this.normalizeConfig(c));
    } catch {
      // No config file yet.
    }

    await this.loadPairingState();
  }

  private async saveConfigs(): Promise<void> {
    await fsp.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    const arr = Array.from(this.configs.values());
    await fsp.writeFile(CONFIG_PATH, JSON.stringify(arr, null, 2), "utf-8");
  }

  getConfig(channelId: ChannelId): ChannelConfig | undefined {
    return this.configs.get(channelId);
  }

  async updateConfig(channelId: ChannelId, patch: Partial<ChannelConfig>): Promise<ChannelConfig> {
    const existing = this.configs.get(channelId) ?? { channelId, enabled: false };
    const updated = this.normalizeConfig({ ...existing, ...patch, channelId });
    this.configs.set(channelId, updated);
    await this.saveConfigs();
    this.pushChannelLog({
      channelId,
      level: "info",
      event: "config_updated",
      message: `Updated ${channelId} config`,
      meta: {
        enabled: updated.enabled,
        hasToken: Boolean(updated.token),
      },
    });
    return updated;
  }

  listAll(): Array<{ config: ChannelConfig; status: ChannelStatus }> {
    const result: Array<{ config: ChannelConfig; status: ChannelStatus }> = [];
    for (const [id, channel] of this.channels) {
      const config = this.configs.get(id) ?? { channelId: id, enabled: false };
      result.push({ config, status: channel.status() });
    }
    return result;
  }

  getStatus(channelId: ChannelId): { config: ChannelConfig; status: ChannelStatus } | undefined {
    const channel = this.channels.get(channelId);
    if (!channel) return undefined;
    const config = this.configs.get(channelId) ?? { channelId, enabled: false };
    return { config, status: channel.status() };
  }

  async startChannel(channelId: ChannelId): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error(`Unknown channel: ${channelId}`);
    const config = this.configs.get(channelId);
    if (!config) throw new Error(`No config for channel: ${channelId}`);

    this.pushChannelLog({
      channelId,
      level: "info",
      event: "start_attempt",
      message: `Starting ${channelId}`,
    });

    try {
      await channel.start(config, (msg) => this.handleInbound(msg));
      config.enabled = true;
      await this.saveConfigs();
      this.pushChannelLog({
        channelId,
        level: "info",
        event: "start_success",
        message: `${channelId} started`,
      });
    } catch (err) {
      this.pushChannelLog({
        channelId,
        level: "error",
        event: "start_failed",
        message: `Failed to start ${channelId}`,
        meta: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  async stopChannel(channelId: ChannelId): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error(`Unknown channel: ${channelId}`);
    await channel.stop();
    this.pushChannelLog({
      channelId,
      level: "info",
      event: "stop",
      message: `${channelId} stopped`,
    });
  }

  async startAll(): Promise<void> {
    await this.loadConfigs();
    for (const [id, config] of this.configs) {
      if (!this.shouldAutoStart(config)) continue;
      const channel = this.channels.get(id);
      if (!channel) continue;
      try {
        await channel.start(config, (msg) => this.handleInbound(msg));
        this.pushChannelLog({
          channelId: id,
          level: "info",
          event: "autostart_success",
          message: `${id} autostarted`,
        });
      } catch (err) {
        this.pushChannelLog({
          channelId: id,
          level: "warn",
          event: "autostart_failed",
          message: `${id} failed to autostart`,
          meta: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const [channelId, channel] of this.channels.entries()) {
      try {
        await channel.stop();
        this.pushChannelLog({
          channelId,
          level: "info",
          event: "stop_all",
          message: `${channelId} stopped`,
        });
      } catch {
        // Best effort.
      }
    }
  }

  listLogs(channelId?: ChannelId, limit = DEFAULT_LOG_LIMIT): ChannelLogEntry[] {
    const bounded = Math.max(1, Math.min(1000, Math.floor(limit)));
    const source = channelId ? this.logs.filter((entry) => entry.channelId === channelId) : this.logs;
    return source.slice(-bounded);
  }

  listCapabilities(channelId?: ChannelId): ChannelCapability[] {
    if (channelId) return [CHANNEL_CAPABILITIES[channelId]];
    return [
      CHANNEL_CAPABILITIES.telegram,
      CHANNEL_CAPABILITIES.discord,
      CHANNEL_CAPABILITIES.slack,
      CHANNEL_CAPABILITIES.whatsapp,
    ];
  }

  async probeChannel(channelId: ChannelId, opts?: { deep?: boolean; timeoutMs?: number }): Promise<ChannelProbeResult> {
    const row = this.getStatus(channelId);
    if (!row) {
      throw new Error(`unknown channel: ${channelId}`);
    }

    const deep = opts?.deep !== false;
    const timeoutMs = typeof opts?.timeoutMs === "number" && Number.isFinite(opts.timeoutMs)
      ? Math.max(1000, Math.min(20_000, Math.floor(opts.timeoutMs)))
      : 7000;

    const { config, status } = row;
    const checks: ChannelProbeCheck[] = [];

    const hasSlackAppToken = channelId !== "slack"
      ? true
      : typeof (config.extra as Record<string, unknown> | undefined)?.appToken === "string"
        && ((config.extra as Record<string, unknown>).appToken as string).trim().length > 0;

    const hasRequiredCredentials = channelId === "whatsapp"
      ? true
      : channelId === "slack"
        ? Boolean(config.token && hasSlackAppToken)
        : Boolean(config.token);

    checks.push({
      name: "configured",
      ok: hasRequiredCredentials,
      severity: hasRequiredCredentials ? "info" : "error",
      message: hasRequiredCredentials ? "Required credentials are present." : "Missing required credentials.",
    });

    checks.push({
      name: "enabled",
      ok: config.enabled,
      severity: config.enabled ? "info" : "warn",
      message: config.enabled ? "Channel is enabled." : "Channel is disabled.",
    });

    checks.push({
      name: "runtime_connected",
      ok: status.connected,
      severity: status.connected ? "info" : "warn",
      message: status.connected ? "Runtime is connected." : "Runtime is not connected.",
    });

    if (status.error) {
      checks.push({
        name: "runtime_error",
        ok: false,
        severity: "error",
        message: status.error,
      });
    }

    if (channelId === "whatsapp") {
      checks.push({
        name: "qr_status",
        ok: Boolean(status.connected || status.qrDataUrl),
        severity: status.connected || status.qrDataUrl ? "info" : "warn",
        message: status.connected
          ? "WhatsApp linked and connected."
          : status.qrDataUrl
            ? "Waiting for QR scan."
            : "Not linked yet; start channel to generate QR.",
      });
    }

    if (deep && hasRequiredCredentials) {
      try {
        if (channelId === "telegram") {
          await withTimeout(this.probeTelegram(config), timeoutMs, "telegram probe");
          checks.push({ name: "auth_probe", ok: true, severity: "info", message: "Telegram auth probe succeeded." });
        } else if (channelId === "discord") {
          await withTimeout(this.probeDiscord(config), timeoutMs, "discord probe");
          checks.push({ name: "auth_probe", ok: true, severity: "info", message: "Discord auth probe succeeded." });
        } else if (channelId === "slack") {
          await withTimeout(this.probeSlack(config), timeoutMs, "slack probe");
          checks.push({ name: "auth_probe", ok: true, severity: "info", message: "Slack auth probe succeeded." });
        }
      } catch (err) {
        checks.push({
          name: "auth_probe",
          ok: false,
          severity: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } else if (!deep) {
      checks.push({
        name: "auth_probe",
        ok: true,
        severity: "info",
        message: "Deep probe skipped.",
      });
    }

    const ok = checks.every((check) => check.ok || check.severity !== "error");
    return {
      channelId,
      probedAt: nowMs(),
      connected: status.connected,
      ok,
      checks,
    };
  }

  private async probeTelegram(config: ChannelConfig): Promise<void> {
    if (!config.token) throw new Error("Telegram token missing");
    const client = this.channels.get("telegram")?.getClient() as { api?: { getMe?: () => Promise<unknown> } } | null;
    if (client?.api?.getMe) {
      await client.api.getMe();
      return;
    }
    const grammy = await import("grammy");
    const bot = new grammy.Bot(config.token);
    await bot.api.getMe();
  }

  private async probeDiscord(config: ChannelConfig): Promise<void> {
    if (!config.token) throw new Error("Discord token missing");
    const client = this.channels.get("discord")?.getClient() as { user?: { id?: string } } | null;
    if (client?.user?.id) return;

    const discord = await import("discord.js");
    const rest = new discord.REST({ version: "10" }).setToken(config.token);
    await rest.get(discord.Routes.user("@me"));
  }

  private async probeSlack(config: ChannelConfig): Promise<void> {
    if (!config.token) throw new Error("Slack bot token missing");
    const appToken = (config.extra as Record<string, unknown> | undefined)?.appToken;
    if (typeof appToken !== "string" || !appToken.trim()) {
      throw new Error("Slack appToken missing");
    }

    const client = this.channels.get("slack")?.getClient() as { client?: { auth?: { test?: (args?: unknown) => Promise<unknown> } } } | null;
    if (client?.client?.auth?.test) {
      await client.client.auth.test({ token: config.token });
      return;
    }

    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Slack auth probe failed with HTTP ${res.status}`);
    }
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!body?.ok) {
      throw new Error(`Slack auth probe failed: ${body?.error ?? "unknown_error"}`);
    }
  }

  async resolveTargets(channelId: ChannelId, entries: string[], kindRaw?: unknown): Promise<ChannelResolveEntry[]> {
    const kind = normalizeResolveKind(kindRaw);
    const cleanEntries = entries
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 50);

    if (cleanEntries.length === 0) return [];

    const results: ChannelResolveEntry[] = [];
    for (const input of cleanEntries) {
      if (channelId === "telegram") {
        results.push(await this.resolveTelegramTarget(input, kind));
      } else if (channelId === "discord") {
        results.push(await this.resolveDiscordTarget(input, kind));
      } else if (channelId === "slack") {
        results.push(await this.resolveSlackTarget(input, kind));
      } else {
        results.push(await this.resolveWhatsAppTarget(input, kind));
      }
    }

    return results;
  }

  private async resolveTelegramTarget(input: string, kind: ResolveKind): Promise<ChannelResolveEntry> {
    if (/^@?[a-zA-Z0-9_]{5,}$/.test(input)) {
      const normalized = input.startsWith("@") ? input : `@${input}`;
      return { input, resolved: normalized, type: kind === "group" ? "group" : "user", confidence: "medium" };
    }
    if (/^-?\d+$/.test(input)) {
      const numeric = input;
      const type = numeric.startsWith("-") ? "group" : "user";
      return { input, resolved: numeric, type, confidence: "high" };
    }
    return { input, resolved: null, type: "unknown", confidence: "low", note: "Could not resolve Telegram target." };
  }

  private async resolveDiscordTarget(input: string, kind: ResolveKind): Promise<ChannelResolveEntry> {
    const userMention = input.match(/^<@!?(\d+)>$/);
    const userMentionId = userMention?.[1];
    if (userMentionId) {
      return { input, resolved: userMentionId, type: "user", confidence: "high" };
    }
    const channelMention = input.match(/^<#(\d+)>$/);
    const channelMentionId = channelMention?.[1];
    if (channelMentionId) {
      return { input, resolved: channelMentionId, type: "group", confidence: "high" };
    }
    if (/^\d{16,22}$/.test(input)) {
      return { input, resolved: input, type: kind === "group" ? "group" : "user", confidence: "high" };
    }

    const client = this.channels.get("discord")?.getClient() as {
      users?: { cache?: Map<string, { id: string; username?: string; displayName?: string }> };
      channels?: { cache?: Map<string, { id: string; name?: string }> };
    } | null;

    const needle = input.toLowerCase();

    if (kind !== "group") {
      const users = client?.users?.cache;
      if (users) {
        for (const user of users.values()) {
          const username = (user.username ?? "").toLowerCase();
          const display = (user.displayName ?? "").toLowerCase();
          if (username === needle || display === needle) {
            return { input, resolved: user.id, type: "user", confidence: "high" };
          }
        }
        for (const user of users.values()) {
          const username = (user.username ?? "").toLowerCase();
          const display = (user.displayName ?? "").toLowerCase();
          if (username.includes(needle) || display.includes(needle)) {
            return { input, resolved: user.id, type: "user", confidence: "medium" };
          }
        }
      }
    }

    if (kind !== "user") {
      const channels = client?.channels?.cache;
      if (channels) {
        for (const channel of channels.values()) {
          const name = (channel.name ?? "").toLowerCase();
          if (name === needle) {
            return { input, resolved: channel.id, type: "group", confidence: "high" };
          }
        }
        for (const channel of channels.values()) {
          const name = (channel.name ?? "").toLowerCase();
          if (name.includes(needle)) {
            return { input, resolved: channel.id, type: "group", confidence: "medium" };
          }
        }
      }
    }

    return { input, resolved: null, type: "unknown", confidence: "low", note: "No Discord match in local cache." };
  }

  private async resolveSlackTarget(input: string, kind: ResolveKind): Promise<ChannelResolveEntry> {
    const userMention = input.match(/^<@([A-Z0-9]+)>$/);
    const userMentionId = userMention?.[1];
    if (userMentionId) {
      return { input, resolved: userMentionId, type: "user", confidence: "high" };
    }
    const channelMention = input.match(/^<#([A-Z0-9]+)\|?.*>$/);
    const channelMentionId = channelMention?.[1];
    if (channelMentionId) {
      return { input, resolved: channelMentionId, type: "group", confidence: "high" };
    }

    if (/^[UW][A-Z0-9]{7,}$/.test(input)) {
      return { input, resolved: input, type: "user", confidence: "high" };
    }
    if (/^[CGD][A-Z0-9]{7,}$/.test(input)) {
      return { input, resolved: input, type: "group", confidence: "high" };
    }

    const app = this.channels.get("slack")?.getClient() as {
      client?: {
        users?: { list?: (args?: unknown) => Promise<{ members?: Array<{ id?: string; name?: string; profile?: { display_name?: string; real_name?: string } }> }> };
        conversations?: { list?: (args?: unknown) => Promise<{ channels?: Array<{ id?: string; name?: string }> }> };
      };
    } | null;

    const needle = input.toLowerCase();

    if (kind !== "group" && app?.client?.users?.list) {
      try {
        const users = await app.client.users.list({ limit: 200 });
        for (const member of users.members ?? []) {
          const id = member.id ?? "";
          const names = [member.name, member.profile?.display_name, member.profile?.real_name]
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.toLowerCase());
          if (!id) continue;
          if (names.some((name) => name === needle)) {
            return { input, resolved: id, type: "user", confidence: "high" };
          }
        }
        for (const member of users.members ?? []) {
          const id = member.id ?? "";
          const names = [member.name, member.profile?.display_name, member.profile?.real_name]
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.toLowerCase());
          if (!id) continue;
          if (names.some((name) => name.includes(needle))) {
            return { input, resolved: id, type: "user", confidence: "medium" };
          }
        }
      } catch {
        // Best effort.
      }
    }

    if (kind !== "user" && app?.client?.conversations?.list) {
      try {
        const channels = await app.client.conversations.list({ limit: 200, exclude_archived: true });
        for (const channel of channels.channels ?? []) {
          const id = channel.id ?? "";
          const name = (channel.name ?? "").toLowerCase();
          if (!id || !name) continue;
          if (name === needle) {
            return { input, resolved: id, type: "group", confidence: "high" };
          }
        }
        for (const channel of channels.channels ?? []) {
          const id = channel.id ?? "";
          const name = (channel.name ?? "").toLowerCase();
          if (!id || !name) continue;
          if (name.includes(needle)) {
            return { input, resolved: id, type: "group", confidence: "medium" };
          }
        }
      } catch {
        // Best effort.
      }
    }

    return { input, resolved: null, type: "unknown", confidence: "low", note: "No Slack match." };
  }

  private async resolveWhatsAppTarget(input: string, kind: ResolveKind): Promise<ChannelResolveEntry> {
    if (input.endsWith("@s.whatsapp.net") || input.endsWith("@g.us")) {
      return {
        input,
        resolved: input,
        type: input.endsWith("@g.us") ? "group" : "user",
        confidence: "high",
      };
    }

    const digits = input.replace(/[^\d+]/g, "");
    const normalized = digits.startsWith("+") ? digits.slice(1) : digits;
    if (/^\d{8,15}$/.test(normalized)) {
      return {
        input,
        resolved: `${normalized}@s.whatsapp.net`,
        type: kind === "group" ? "group" : "user",
        confidence: "medium",
      };
    }

    return { input, resolved: null, type: "unknown", confidence: "low", note: "Use E.164 phone number or jid." };
  }

  listPairing(channelId?: ChannelId): ChannelPairingListResult {
    this.expirePairingRequests();

    const requests = [...this.pairingRequests.values()]
      .filter((request) => !channelId || request.channelId === channelId)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const pending = requests.filter((request) => request.status === "pending");
    const recent = requests.filter((request) => request.status !== "pending").slice(0, 50);

    const approved = [...this.pairingApprovals.values()]
      .filter((row) => !channelId || row.channelId === channelId)
      .sort((a, b) => b.approvedAt - a.approvedAt);

    return { pending, approved, recent };
  }

  approvePairing(params: {
    requestId?: string;
    channelId?: ChannelId;
    code?: string;
    approvedBy?: string;
  }): { ok: boolean; request?: ChannelPairingRequest; approval?: ChannelPairingApproval; error?: string } {
    let request: ChannelPairingRequest | undefined;

    if (params.requestId) {
      request = this.pairingRequests.get(params.requestId);
    } else if (params.channelId && params.code) {
      request = this.findPendingPairingByCode(params.channelId, params.code);
    }

    if (!request) {
      return { ok: false, error: "Pairing request not found" };
    }

    if (request.status !== "pending") {
      return { ok: false, error: `Pairing request is already ${request.status}` };
    }

    const now = nowMs();
    request.status = "approved";
    request.updatedAt = now;
    request.resolvedAt = now;
    request.resolvedBy = params.approvedBy;

    const approval: ChannelPairingApproval = {
      channelId: request.channelId,
      userId: request.userId,
      approvedAt: now,
      requestId: request.requestId,
      approvedBy: params.approvedBy,
    };

    this.pairingApprovals.set(this.pairingKey(request.channelId, request.userId), approval);
    this.queuePairingStateSave();

    this.pushChannelLog({
      channelId: request.channelId,
      level: "info",
      event: "pairing_approved",
      message: `Approved pairing for ${request.userId}`,
      meta: { requestId: request.requestId },
    });

    return { ok: true, request, approval };
  }

  rejectPairing(params: {
    requestId?: string;
    channelId?: ChannelId;
    code?: string;
    rejectedBy?: string;
  }): { ok: boolean; request?: ChannelPairingRequest; error?: string } {
    let request: ChannelPairingRequest | undefined;

    if (params.requestId) {
      request = this.pairingRequests.get(params.requestId);
    } else if (params.channelId && params.code) {
      request = this.findPendingPairingByCode(params.channelId, params.code);
    }

    if (!request) {
      return { ok: false, error: "Pairing request not found" };
    }

    if (request.status !== "pending") {
      return { ok: false, error: `Pairing request is already ${request.status}` };
    }

    const now = nowMs();
    request.status = "rejected";
    request.updatedAt = now;
    request.resolvedAt = now;
    request.resolvedBy = params.rejectedBy;
    this.queuePairingStateSave();

    this.pushChannelLog({
      channelId: request.channelId,
      level: "info",
      event: "pairing_rejected",
      message: `Rejected pairing for ${request.userId}`,
      meta: { requestId: request.requestId },
    });

    return { ok: true, request };
  }

  revokePairing(channelId: ChannelId, userId: string): { ok: boolean; removed?: ChannelPairingApproval; error?: string } {
    const key = this.pairingKey(channelId, userId);
    const existing = this.pairingApprovals.get(key);
    if (!existing) {
      return { ok: false, error: "Pairing approval not found" };
    }

    this.pairingApprovals.delete(key);
    this.queuePairingStateSave();

    this.pushChannelLog({
      channelId,
      level: "info",
      event: "pairing_revoked",
      message: `Revoked pairing for ${userId}`,
    });

    return { ok: true, removed: existing };
  }

  private handleInbound(msg: ChannelMessage): void {
    const config = this.configs.get(msg.channelId);
    const policy = this.resolveDmPolicy(config);

    const policyCheck = this.shouldAcceptByPolicy(msg, config);
    if (!policyCheck.accept) {
      this.pushChannelLog({
        channelId: msg.channelId,
        level: policyCheck.reason === "pairing_required" ? "info" : "warn",
        event: "inbound_blocked",
        message: `Blocked inbound message from ${msg.from}`,
        meta: { reason: policyCheck.reason },
      });
      return;
    }

    if (!shouldAcceptMessage(msg, this.buildEffectiveFilter(config, policy))) {
      this.pushChannelLog({
        channelId: msg.channelId,
        level: "warn",
        event: "inbound_filtered",
        message: `Filtered inbound message from ${msg.from}`,
      });
      return;
    }

    if (msg.mediaUrl) {
      const maxBytes = config?.maxMediaBytes ?? 10 * 1024 * 1024;
      if (!isMediaWithinLimit(0, maxBytes)) {
        this.pushChannelLog({
          channelId: msg.channelId,
          level: "warn",
          event: "media_rejected",
          message: `Rejected media from ${msg.from} (over limit)`,
        });
        return;
      }
    }

    const rl = this.getRateLimiter(msg.channelId);
    if (!rl.allow(msg.from)) {
      this.pushChannelLog({
        channelId: msg.channelId,
        level: "warn",
        event: "rate_limited",
        message: `Rate limited sender ${msg.from}`,
      });
      return;
    }

    this.pushChannelLog({
      channelId: msg.channelId,
      level: "info",
      event: "inbound_enqueued",
      message: `Queued inbound message from ${msg.from}`,
      meta: { chatType: msg.chatType },
    });
    this.messageQueue.enqueue(msg);
  }

  private async processInbound(msg: ChannelMessage): Promise<void> {
    const sessionId = `channel-${msg.channelId}-${msg.to}`;

    this.deps.eventBus.emit(sessionId, "CHANNEL_MESSAGE_IN" as never, { message: msg });

    try {
      await this.deps.chatService.getOrCreate(sessionId, { systemPrompt: CHANNEL_SYSTEM_PROMPT });

      // Parse inline directives from channel messages.
      const { directives, cleanMessage } = parseDirectives(msg.text);
      for (const d of directives) {
        if (d.type === "reset") {
          await this.deps.chatService.resetSession(sessionId);
          const channel = this.channels.get(msg.channelId);
          if (channel) await channel.send(msg.to, "Session reset.", { threadId: msg.threadId });
          this.pushChannelLog({
            channelId: msg.channelId,
            level: "info",
            event: "session_reset",
            message: `Reset session from channel message (${msg.from})`,
          });
          return;
        }
      }

      let userText = cleanMessage || msg.text;
      if (msg.mediaUrl && this.deps.mediaService) {
        try {
          const stored = await this.deps.mediaService.download(msg.mediaUrl);
          userText += `\n[Media downloaded: ${stored.contentType}, ${stored.size} bytes, saved to ${stored.filePath}]`;

          if (this.deps.mediaUnderstanding) {
            try {
              if (this.deps.mediaUnderstanding.isImage(stored.filePath)) {
                const { description } = await this.deps.mediaUnderstanding.describeImage(stored.filePath);
                userText += `\n[Image description: ${description}]`;
              } else if (this.deps.mediaUnderstanding.isAudio(stored.filePath)) {
                const { text } = await this.deps.mediaUnderstanding.transcribeAudio(stored.filePath);
                userText += `\n[Audio transcription: ${text}]`;
              }
            } catch {
              // Media understanding failed; continue with basic info.
            }
          }
        } catch {
          userText += `\n[Media download failed for: ${msg.mediaUrl}]`;
        }
      }

      await this.deps.chatService.addUserMessage(sessionId, userText);

      let messages = await this.deps.chatService.buildApiMessages(sessionId);
      if (messages.length > 0 && messages[0]?.role === "system") {
        messages[0] = { role: "system", content: CHANNEL_SYSTEM_PROMPT };
      } else {
        messages = [{ role: "system", content: CHANNEL_SYSTEM_PROMPT }, ...messages];
      }
      const response = await this.deps.callLLM(messages, this.deps.registry.definitions, false);

      let replyText: string;
      if (response instanceof Response) {
        const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        replyText = json.choices?.[0]?.message?.content ?? "I couldn't generate a response.";
      } else {
        replyText = response.content ?? "I couldn't generate a response.";
      }

      await this.deps.chatService.addAssistantMessage(sessionId, replyText);

      const channel = this.channels.get(msg.channelId);
      if (channel) {
        await channel.send(msg.to, replyText, { threadId: msg.threadId });
      }

      this.deps.eventBus.emit(sessionId, "CHANNEL_MESSAGE_OUT" as never, {
        channelId: msg.channelId,
        to: msg.to,
        text: replyText,
      });

      this.pushChannelLog({
        channelId: msg.channelId,
        level: "info",
        event: "outbound_sent",
        message: `Sent reply to ${msg.to}`,
      });
    } catch (err) {
      const channel = this.channels.get(msg.channelId);
      if (channel) {
        try {
          await channel.send(msg.to, `Sorry, I encountered an error: ${(err as Error).message}`, { threadId: msg.threadId });
        } catch {
          // Best effort.
        }
      }

      this.pushChannelLog({
        channelId: msg.channelId,
        level: "error",
        event: "inbound_processing_failed",
        message: `Failed to process inbound message from ${msg.from}`,
        meta: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }
}
