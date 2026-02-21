import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type DaemonBindMode = "loopback" | "all" | "custom";
export type DaemonAuthMode = "open" | "token";
export type DaemonSecurityPolicy = "strict" | "balanced" | "permissive";
export type DaemonOperationMode = "normal" | "drain" | "paused";

export type DaemonOperationalState = {
  mode: DaemonOperationMode;
  reason: string;
  updatedAt: string;
};

export type DaemonSettingsRecord = {
  host: string;
  port: number;
  bindMode: DaemonBindMode;
  authMode: DaemonAuthMode;
  token: string;
  securityPolicy: DaemonSecurityPolicy;
  operationMode: DaemonOperationMode;
  operationReason: string;
  updatedAt: string;
};

export type DaemonSettingsPatch = Partial<{
  host: string;
  port: number;
  bindMode: DaemonBindMode;
  authMode: DaemonAuthMode;
  token: string;
  rotateToken: boolean;
  securityPolicy: DaemonSecurityPolicy;
  operationMode: DaemonOperationMode;
  operationReason: string;
}>;

export type DaemonSettingsSnapshot = {
  settingsFile: string;
  desired: DaemonSettingsRecord;
  effective: {
    host: string;
    port: number;
    bindMode: DaemonBindMode;
    authMode: DaemonAuthMode;
    tokenSet: boolean;
    securityPolicy: DaemonSecurityPolicy;
    operationMode: DaemonOperationMode;
    operationReason: string;
  };
  restartRequired: boolean;
};

const SETTINGS_FILE = path.join(os.homedir(), ".undoable", "daemon-settings.json");

const DEFAULT_PORT = 7433;
const LOOPBACK_HOST = "127.0.0.1";
const ALL_INTERFACES_HOST = "0.0.0.0";

function inferBindMode(host: string): DaemonBindMode {
  const normalized = host.trim();
  if (normalized === LOOPBACK_HOST || normalized === "localhost") return "loopback";
  if (normalized === ALL_INTERFACES_HOST) return "all";
  return "custom";
}

function inferSecurityPolicy(input: {
  host: string;
  authMode: DaemonAuthMode;
  explicit?: string;
}): DaemonSecurityPolicy {
  const explicit = input.explicit?.trim().toLowerCase();
  if (explicit === "strict" || explicit === "balanced" || explicit === "permissive") {
    return explicit;
  }
  const bindMode = inferBindMode(input.host);
  if (bindMode === "loopback" && input.authMode === "token") return "strict";
  if (bindMode === "all" && input.authMode === "open") return "permissive";
  return "balanced";
}

function parsePort(raw: string | undefined): number {
  const parsed = Number(raw ?? "");
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535) {
    return Math.floor(parsed);
  }
  return DEFAULT_PORT;
}

function resolveRuntimeHost(): string {
  const host =
    process.env.NRN_HOST?.trim() ||
    process.env.UNDOABLE_DAEMON_HOST?.trim() ||
    LOOPBACK_HOST;
  return host.length > 0 ? host : LOOPBACK_HOST;
}

function resolveRuntimePort(): number {
  return parsePort(process.env.NRN_PORT?.trim() || process.env.UNDOABLE_DAEMON_PORT?.trim());
}

function createDefaultRecord(): DaemonSettingsRecord {
  const host = resolveRuntimeHost();
  const token = process.env.UNDOABLE_TOKEN?.trim() ?? "";
  const authMode: DaemonAuthMode = token.length > 0 ? "token" : "open";
  return {
    host,
    port: resolveRuntimePort(),
    bindMode: inferBindMode(host),
    authMode,
    token,
    securityPolicy: inferSecurityPolicy({
      host,
      authMode,
      explicit: process.env.UNDOABLE_SECURITY_POLICY,
    }),
    operationMode: "normal",
    operationReason: "",
    updatedAt: new Date().toISOString(),
  };
}

function ensureHost(host: string): string {
  const normalized = host.trim();
  if (!normalized) throw new Error("host must be a non-empty string");
  if (/\s/.test(normalized)) throw new Error("host must not contain whitespace");
  return normalized;
}

function ensurePort(port: number): number {
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error("port must be a number between 1 and 65535");
  }
  return Math.floor(port);
}

function ensureBindMode(mode: string): DaemonBindMode {
  if (mode === "loopback" || mode === "all" || mode === "custom") return mode;
  throw new Error("bindMode must be loopback, all, or custom");
}

function ensureAuthMode(mode: string): DaemonAuthMode {
  if (mode === "open" || mode === "token") return mode;
  throw new Error("authMode must be open or token");
}

function ensureSecurityPolicy(policy: string): DaemonSecurityPolicy {
  if (policy === "strict" || policy === "balanced" || policy === "permissive") {
    return policy;
  }
  throw new Error("securityPolicy must be strict, balanced, or permissive");
}

function ensureOperationMode(mode: string): DaemonOperationMode {
  if (mode === "normal" || mode === "drain" || mode === "paused") return mode;
  throw new Error("operationMode must be normal, drain, or paused");
}

function normalizeOperationReason(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 280) {
    throw new Error("operationReason must be at most 280 characters");
  }
  return trimmed;
}

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

function normalizeRecord(input: Partial<DaemonSettingsRecord>): DaemonSettingsRecord {
  const base = createDefaultRecord();
  const host = ensureHost(typeof input.host === "string" ? input.host : base.host);
  const authMode =
    typeof input.authMode === "string"
      ? ensureAuthMode(input.authMode)
      : (input.token?.trim() ? "token" : base.authMode);
  const token = typeof input.token === "string" ? input.token.trim() : base.token;
  const bindMode = ensureBindMode(
    typeof input.bindMode === "string" ? input.bindMode : inferBindMode(host),
  );
  const normalizedHost =
    bindMode === "loopback"
      ? LOOPBACK_HOST
      : bindMode === "all"
        ? ALL_INTERFACES_HOST
        : host;
  const normalizedToken = authMode === "token" ? token : "";
  const port = ensurePort(
    typeof input.port === "number" ? input.port : base.port,
  );
  const securityPolicy = ensureSecurityPolicy(
    typeof input.securityPolicy === "string"
      ? input.securityPolicy
      : inferSecurityPolicy({
          host: normalizedHost,
          authMode,
          explicit: base.securityPolicy,
        }),
  );
  const operationMode = ensureOperationMode(
    typeof input.operationMode === "string" ? input.operationMode : "normal",
  );
  const operationReason = normalizeOperationReason(
    typeof input.operationReason === "string" ? input.operationReason : "",
  );
  return {
    host: normalizedHost,
    port,
    bindMode,
    authMode,
    token: normalizedToken,
    securityPolicy,
    operationMode,
    operationReason,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : new Date().toISOString(),
  };
}

export class DaemonSettingsService {
  private readonly settingsFile: string;

  constructor(settingsFile = SETTINGS_FILE) {
    this.settingsFile = settingsFile;
  }

  private async loadStored(): Promise<DaemonSettingsRecord | null> {
    try {
      const raw = await fs.readFile(this.settingsFile, "utf-8");
      const parsed = JSON.parse(raw) as Partial<DaemonSettingsRecord>;
      return normalizeRecord(parsed);
    } catch {
      return null;
    }
  }

  private async save(record: DaemonSettingsRecord): Promise<void> {
    await fs.mkdir(path.dirname(this.settingsFile), { recursive: true });
    await fs.writeFile(this.settingsFile, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
  }

  private getEffective(
    desired?: DaemonSettingsRecord,
  ): DaemonSettingsSnapshot["effective"] {
    const host = resolveRuntimeHost();
    const token = process.env.UNDOABLE_TOKEN?.trim() ?? "";
    const authMode: DaemonAuthMode = token.length > 0 ? "token" : "open";
    return {
      host,
      port: resolveRuntimePort(),
      bindMode: inferBindMode(host),
      authMode,
      tokenSet: token.length > 0,
      securityPolicy: inferSecurityPolicy({
        host,
        authMode,
        explicit: process.env.UNDOABLE_SECURITY_POLICY,
      }),
      operationMode: desired?.operationMode ?? "normal",
      operationReason: desired?.operationReason ?? "",
    };
  }

  private computeRestartRequired(
    desired: DaemonSettingsRecord,
    effective: DaemonSettingsSnapshot["effective"],
  ): boolean {
    if (desired.host !== effective.host) return true;
    if (desired.port !== effective.port) return true;
    if (desired.bindMode !== effective.bindMode) return true;
    if (desired.authMode !== effective.authMode) return true;
    if (desired.securityPolicy !== effective.securityPolicy) return true;
    if (desired.authMode === "token" && !effective.tokenSet) return true;
    return false;
  }

  async getSnapshot(): Promise<DaemonSettingsSnapshot> {
    const desired = (await this.loadStored()) ?? createDefaultRecord();
    const effective = this.getEffective(desired);
    return {
      settingsFile: this.settingsFile,
      desired,
      effective,
      restartRequired: this.computeRestartRequired(desired, effective),
    };
  }

  async update(patch: DaemonSettingsPatch): Promise<DaemonSettingsSnapshot> {
    const current = (await this.loadStored()) ?? createDefaultRecord();
    const next: Partial<DaemonSettingsRecord> = { ...current };
    let explicitBindMode: DaemonBindMode | undefined;

    if (patch.bindMode !== undefined) {
      const bindMode = ensureBindMode(String(patch.bindMode));
      explicitBindMode = bindMode;
      next.bindMode = bindMode;
      if (bindMode === "loopback") {
        next.host = LOOPBACK_HOST;
      } else if (bindMode === "all") {
        next.host = ALL_INTERFACES_HOST;
      }
    }

    if (patch.host !== undefined) {
      const requestedHost = ensureHost(String(patch.host));
      const activeBindMode = explicitBindMode ?? next.bindMode ?? current.bindMode;
      if (activeBindMode === "custom") {
        next.host = requestedHost;
        next.bindMode = "custom";
      } else if (explicitBindMode === undefined) {
        next.host = requestedHost;
        next.bindMode = inferBindMode(requestedHost);
      }
    }

    if (patch.port !== undefined) {
      next.port = ensurePort(Number(patch.port));
    }

    if (patch.authMode !== undefined) {
      next.authMode = ensureAuthMode(String(patch.authMode));
      if (next.authMode === "open") {
        next.token = "";
      }
    }

    if (patch.token !== undefined) {
      next.token = String(patch.token).trim();
    }

    if (patch.rotateToken) {
      next.authMode = "token";
      next.token = generateToken();
    }

    if (patch.securityPolicy !== undefined) {
      next.securityPolicy = ensureSecurityPolicy(String(patch.securityPolicy));
    }
    if (patch.operationMode !== undefined) {
      next.operationMode = ensureOperationMode(String(patch.operationMode));
    }
    if (patch.operationReason !== undefined) {
      next.operationReason = normalizeOperationReason(String(patch.operationReason));
    }

    const record = normalizeRecord({
      ...next,
      updatedAt: new Date().toISOString(),
    });

    if (record.authMode === "token" && !record.token.trim()) {
      record.token = generateToken();
    }

    await this.save(record);
    return this.getSnapshot();
  }

  async getOperationalState(): Promise<DaemonOperationalState> {
    const snapshot = await this.getSnapshot();
    return {
      mode: snapshot.desired.operationMode,
      reason: snapshot.desired.operationReason,
      updatedAt: snapshot.desired.updatedAt,
    };
  }

  async setOperationalState(
    mode: DaemonOperationMode,
    reason?: string,
  ): Promise<DaemonOperationalState> {
    const snapshot = await this.update({
      operationMode: mode,
      operationReason: reason ?? "",
    });
    return {
      mode: snapshot.desired.operationMode,
      reason: snapshot.desired.operationReason,
      updatedAt: snapshot.desired.updatedAt,
    };
  }
}
