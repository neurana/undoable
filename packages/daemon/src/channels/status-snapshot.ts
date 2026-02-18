import type { ChannelConfig, ChannelStatus } from "./types.js";

export type ChannelDmPolicy = "pairing" | "allowlist" | "open" | "disabled";

export type ChannelStatusDiagnostic = {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  recovery?: string;
};

export type ChannelStatusSnapshot = {
  channelId: ChannelConfig["channelId"];
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  status: "connected" | "awaiting_scan" | "error" | "offline";
  dmPolicy: ChannelDmPolicy;
  allowDMs: boolean;
  allowGroups: boolean;
  allowlistCount: number;
  blocklistCount: number;
  hasToken: boolean;
  hasAppToken: boolean;
  qrReady: boolean;
  needsSetup: boolean;
  canAutoStart: boolean;
  accountName?: string;
  error?: string;
  reconnectAttempts: number;
  startedAt?: number;
  lastConnectedAt?: number;
  lastDisconnectedAt?: number;
  lastErrorAt?: number;
  rateLimitPerMinute: number;
  maxMediaBytes: number;
  diagnostics: ChannelStatusDiagnostic[];
};

function parseDmPolicy(value: unknown): ChannelDmPolicy | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "pairing" || normalized === "allowlist" || normalized === "open" || normalized === "disabled") {
    return normalized;
  }
  return undefined;
}

function hasAppToken(extra: Record<string, unknown> | undefined): boolean {
  if (!extra) return false;
  return typeof extra.appToken === "string" && extra.appToken.trim().length > 0;
}

function isConfigured(config: ChannelConfig): boolean {
  if (config.channelId === "whatsapp") return true;
  if (config.channelId === "slack") return Boolean(config.token && hasAppToken(config.extra as Record<string, unknown> | undefined));
  return Boolean(config.token);
}

function inferDmPolicy(config: ChannelConfig): ChannelDmPolicy {
  const extra = config.extra as Record<string, unknown> | undefined;
  const fromExtra = parseDmPolicy(extra?.dmPolicy);
  if (fromExtra) return fromExtra;
  if (config.allowDMs === false) return "disabled";
  if (Array.isArray(config.userAllowlist) && config.userAllowlist.length > 0) return "allowlist";
  return "pairing";
}

function canAutoStart(config: ChannelConfig): boolean {
  if (!config.enabled) return false;
  if (config.channelId === "whatsapp") return true;
  if (config.channelId === "slack") return Boolean(config.token && hasAppToken(config.extra as Record<string, unknown> | undefined));
  return Boolean(config.token);
}

export function buildChannelStatusSnapshot(config: ChannelConfig, status: ChannelStatus): ChannelStatusSnapshot {
  const configured = isConfigured(config);
  const policy = inferDmPolicy(config);
  const allowDMs = config.allowDMs ?? true;
  const allowGroups = config.allowGroups ?? true;
  const allowlistCount = Array.isArray(config.userAllowlist) ? config.userAllowlist.length : 0;
  const blocklistCount = Array.isArray(config.userBlocklist) ? config.userBlocklist.length : 0;
  const hasToken = typeof config.token === "string" && config.token.trim().length > 0;
  const hasSlackAppToken = config.channelId === "slack"
    ? hasAppToken(config.extra as Record<string, unknown> | undefined)
    : false;
  const qrReady = Boolean(status.qrDataUrl);
  const needsSetup = config.enabled && !configured;
  const diagnostics: ChannelStatusDiagnostic[] = [];

  if (needsSetup) {
    diagnostics.push({
      code: "missing_credentials",
      severity: "error",
      message: `${config.channelId} is enabled but missing required credentials.`,
      recovery: config.channelId === "whatsapp"
        ? "Run channel login/Start and scan WhatsApp QR."
        : "Set credentials and restart the channel.",
    });
  }

  if (status.error) {
    diagnostics.push({
      code: "runtime_error",
      severity: "error",
      message: status.error,
      recovery: "Inspect channel credentials and restart.",
    });
  }

  if (config.channelId === "whatsapp" && config.enabled && !status.connected && qrReady) {
    diagnostics.push({
      code: "awaiting_qr_scan",
      severity: "info",
      message: "WhatsApp is waiting for QR scan.",
      recovery: "Open WhatsApp Linked Devices and scan the QR code.",
    });
  }

  if (policy === "allowlist" && allowlistCount === 0) {
    diagnostics.push({
      code: "allowlist_empty",
      severity: "warn",
      message: "Allowlist mode is enabled but allowlist is empty.",
      recovery: "Add at least one user to userAllowlist/allowlist.",
    });
  }

  if (!config.enabled && configured) {
    diagnostics.push({
      code: "configured_but_disabled",
      severity: "info",
      message: `${config.channelId} is configured but currently disabled.`,
      recovery: "Start the channel to receive messages.",
    });
  }

  const statusLabel: ChannelStatusSnapshot["status"] = status.connected
    ? "connected"
    : qrReady
      ? "awaiting_scan"
      : status.error
        ? "error"
        : "offline";

  return {
    channelId: config.channelId,
    configured,
    enabled: config.enabled,
    connected: status.connected,
    status: statusLabel,
    dmPolicy: policy,
    allowDMs,
    allowGroups,
    allowlistCount,
    blocklistCount,
    hasToken,
    hasAppToken: hasSlackAppToken,
    qrReady,
    needsSetup,
    canAutoStart: canAutoStart(config),
    accountName: status.accountName,
    error: status.error,
    reconnectAttempts: status.reconnectAttempts ?? 0,
    startedAt: status.startedAt,
    lastConnectedAt: status.lastConnectedAt,
    lastDisconnectedAt: status.lastDisconnectedAt,
    lastErrorAt: status.lastErrorAt,
    rateLimitPerMinute: config.rateLimit ?? 20,
    maxMediaBytes: config.maxMediaBytes ?? 10 * 1024 * 1024,
    diagnostics,
  };
}
