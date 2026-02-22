import { randomBytes } from "node:crypto";

export type DaemonBindMode = "loopback" | "all" | "custom";

export type DaemonSettingsShape = {
  host?: unknown;
  bindMode?: unknown;
  authMode?: unknown;
  token?: unknown;
  securityPolicy?: unknown;
  [key: string]: unknown;
};

export type DaemonSettingsRepairResult = {
  changed: boolean;
  notes: string[];
  settings: DaemonSettingsShape;
  generatedToken?: string;
};

function normalizeHost(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function inferDaemonBindMode(settings: DaemonSettingsShape): DaemonBindMode {
  const bindMode = typeof settings.bindMode === "string"
    ? settings.bindMode.trim().toLowerCase()
    : "";
  if (bindMode === "loopback" || bindMode === "all" || bindMode === "custom") {
    return bindMode;
  }
  const host = normalizeHost(settings.host);
  if (!host || host === "127.0.0.1" || host === "localhost" || host === "::1") {
    return "loopback";
  }
  if (host === "0.0.0.0" || host === "::") {
    return "all";
  }
  return "custom";
}

export function generateDaemonToken(length = 24): string {
  return randomBytes(length).toString("base64url");
}

export function repairDaemonSettingsSecurityProfile(
  settings: DaemonSettingsShape,
): DaemonSettingsRepairResult {
  const repaired: DaemonSettingsShape = { ...settings };
  let generatedToken: string | undefined;
  const notes: string[] = [];
  let changed = false;

  const bindMode = inferDaemonBindMode(repaired);
  const currentAuthMode = typeof repaired.authMode === "string"
    ? repaired.authMode.trim().toLowerCase()
    : "open";

  if (bindMode !== "loopback" && currentAuthMode !== "token") {
    repaired.authMode = "token";
    changed = true;
    notes.push(`Switched authMode to token for non-loopback bind (${bindMode}).`);
  }

  const effectiveAuthMode = typeof repaired.authMode === "string"
    ? repaired.authMode.trim().toLowerCase()
    : "open";
  const effectiveToken = typeof repaired.token === "string"
    ? repaired.token.trim()
    : "";
  if (effectiveAuthMode === "token" && effectiveToken.length === 0) {
    generatedToken = generateDaemonToken();
    repaired.token = generatedToken;
    changed = true;
    notes.push("Generated missing daemon token.");
  }

  return {
    changed,
    notes,
    settings: repaired,
    generatedToken,
  };
}
