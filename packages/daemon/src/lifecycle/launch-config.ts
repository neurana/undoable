import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_PORT = 7433;
const DEFAULT_SETTINGS_FILE = path.join(
  os.homedir(),
  ".undoable",
  "daemon-settings.json",
);

type SecurityPolicy = "strict" | "balanced" | "permissive";
type StoredLaunchSettings = {
  host?: unknown;
  port?: unknown;
  authMode?: unknown;
  token?: unknown;
  securityPolicy?: unknown;
};

export type DaemonLaunchConfig = {
  port: number;
  host?: string;
  token: string;
  securityPolicy: SecurityPolicy;
  settingsFile: string;
};

function parsePort(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.floor(value);
    if (rounded >= 1 && rounded <= 65535) return rounded;
    return undefined;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535) return parsed;
  }
  return undefined;
}

function parseHost(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (/\s/.test(normalized)) return undefined;
  return normalized;
}

function parseToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseSecurityPolicy(value: unknown): SecurityPolicy | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "strict" ||
    normalized === "balanced" ||
    normalized === "permissive"
  ) {
    return normalized;
  }
  return undefined;
}

function readStoredSettings(settingsFile: string): StoredLaunchSettings | null {
  try {
    if (!fs.existsSync(settingsFile)) return null;
    const raw = fs.readFileSync(settingsFile, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLaunchSettings;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function inferSecurityPolicy(host: string | undefined, token: string): SecurityPolicy {
  const normalizedHost = (host ?? "").trim().toLowerCase();
  const hasToken = token.length > 0;
  if (
    (normalizedHost === "127.0.0.1" || normalizedHost === "localhost") &&
    hasToken
  ) {
    return "strict";
  }
  if ((normalizedHost === "0.0.0.0" || normalizedHost === "::") && !hasToken) {
    return "permissive";
  }
  return "balanced";
}

export function resolveDaemonLaunchConfig(
  env: NodeJS.ProcessEnv = process.env,
): DaemonLaunchConfig {
  const settingsFile =
    env.UNDOABLE_DAEMON_SETTINGS_FILE?.trim() || DEFAULT_SETTINGS_FILE;
  const stored = readStoredSettings(settingsFile);

  const envPort = parsePort(env.NRN_PORT ?? env.UNDOABLE_DAEMON_PORT);
  const storedPort = parsePort(stored?.port);
  const port = envPort ?? storedPort ?? DEFAULT_PORT;

  const envHost = parseHost(env.NRN_HOST ?? env.UNDOABLE_DAEMON_HOST);
  const storedHost = parseHost(stored?.host);
  const host = envHost ?? storedHost;

  const envToken = parseToken(env.UNDOABLE_TOKEN);
  const storedAuthMode =
    typeof stored?.authMode === "string"
      ? stored.authMode.trim().toLowerCase()
      : "";
  const storedToken = parseToken(stored?.token);
  const token =
    envToken ??
    (storedAuthMode === "token" ? (storedToken ?? "") : "");

  const securityPolicy =
    parseSecurityPolicy(env.UNDOABLE_SECURITY_POLICY) ??
    parseSecurityPolicy(stored?.securityPolicy) ??
    inferSecurityPolicy(host, token);

  env.UNDOABLE_DAEMON_SETTINGS_FILE = settingsFile;
  env.NRN_PORT = String(port);
  if (host) {
    env.NRN_HOST = host;
  } else {
    delete env.NRN_HOST;
  }
  if (token) {
    env.UNDOABLE_TOKEN = token;
  } else {
    delete env.UNDOABLE_TOKEN;
  }
  env.UNDOABLE_SECURITY_POLICY = securityPolicy;

  return {
    port,
    host,
    token,
    securityPolicy,
    settingsFile,
  };
}
