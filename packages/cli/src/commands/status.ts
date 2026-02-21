import { Command } from "commander";
import fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { daemonRequest } from "./daemon-client.js";
import {
  collectChannelSecurityFindings,
  summarizeChannelSecurity,
  type ChannelSecurityFinding,
  type ChannelSecuritySnapshot,
} from "./channel-security.js";

const HOME = os.homedir();
const DEFAULT_PORT = 7433;
const DEFAULT_PATHS = {
  home: HOME,
  pidFile: path.join(HOME, ".undoable", "daemon.pid.json"),
  daemonSettingsFile: path.join(HOME, ".undoable", "daemon-settings.json"),
  providersFile: path.join(HOME, ".undoable", "providers.json"),
} as const;
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const NC = "\x1b[0m";

type DaemonPaths = {
  home: string;
  pidFile: string;
  daemonSettingsFile: string;
  providersFile: string;
};

type DaemonStateRecord = {
  pid?: number;
  port: number;
};

type DaemonStatusSummary = {
  state: "running" | "degraded" | "stopped";
  port: number;
  ready?: boolean;
  authRequired?: boolean;
  statusCode?: number;
  checks?: Record<string, unknown>;
  detail?: string;
};

type GatewayStatusResult = {
  scheduler?: {
    jobCount?: number;
    nextWakeAtMs?: number;
  };
};

type GatewayChannelsStatusResult = {
  channelOrder?: string[];
  channels?: Record<string, unknown>;
  channelSnapshots?: Record<string, unknown>;
};

type GatewayDiagnostics = {
  scheduler?: {
    jobCount?: number;
    nextWakeAtMs?: number;
  };
  channels?: {
    total: number;
    connected: number;
    pendingPairing: number;
    approvedPairing: number;
    security: ReturnType<typeof summarizeChannelSecurity>;
    findings: ChannelSecurityFinding[];
  };
  error?: string;
};

function readDaemonState(paths: DaemonPaths = DEFAULT_PATHS): DaemonStateRecord {
  try {
    const raw = fs.readFileSync(paths.pidFile, "utf-8").trim();
    if (!raw) return { port: DEFAULT_PORT };
    const parsed = JSON.parse(raw) as { port?: unknown; pid?: unknown };
    const port =
      typeof parsed.port === "number" && parsed.port > 0 && parsed.port <= 65535
        ? parsed.port
        : DEFAULT_PORT;
    const pid =
      typeof parsed.pid === "number" && Number.isInteger(parsed.pid) && parsed.pid > 0
        ? parsed.pid
        : undefined;
    return { port, pid };
  } catch {
    return { port: DEFAULT_PORT };
  }
}

function resolveDaemonPort(paths: DaemonPaths = DEFAULT_PATHS): number {
  return readDaemonState(paths).port;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

function resolveSavedDaemonToken(paths: DaemonPaths = DEFAULT_PATHS): string | undefined {
  const envToken = process.env.UNDOABLE_TOKEN?.replace(/^Bearer\s+/i, "").trim();
  if (envToken) return envToken;
  try {
    const raw = fs.readFileSync(paths.daemonSettingsFile, "utf-8").trim();
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as {
      authMode?: unknown;
      token?: unknown;
      securityPolicy?: unknown;
    };
    const authMode = typeof parsed.authMode === "string" ? parsed.authMode.toLowerCase().trim() : "open";
    if (authMode !== "token") return undefined;
    if (typeof parsed.token !== "string") return undefined;
    const token = parsed.token.trim();
    return token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
}

function extractHealthChecks(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export async function resolveDaemonStatus(paths: DaemonPaths = DEFAULT_PATHS): Promise<DaemonStatusSummary> {
  const daemonState = readDaemonState(paths);
  const token = resolveSavedDaemonToken(paths);
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const healthUrl = `http://127.0.0.1:${daemonState.port}/health`;
  try {
    const res = await fetch(healthUrl, {
      headers,
      signal: AbortSignal.timeout(2000),
    });
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      payload = undefined;
    }
    if (res.ok) {
      const checks = extractHealthChecks(
        payload && typeof payload === "object" ? (payload as { checks?: unknown }).checks : undefined,
      );
      const ready = payload && typeof payload === "object"
        ? (payload as { ready?: unknown }).ready !== false
        : true;
      return {
        state: ready ? "running" : "degraded",
        port: daemonState.port,
        ready,
        statusCode: res.status,
        checks,
      };
    }

    if (res.status === 401) {
      return {
        state: "running",
        port: daemonState.port,
        authRequired: true,
        statusCode: res.status,
        detail: "Daemon is running but requires a token for API calls.",
      };
    }

    const detail = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error: unknown }).error)
      : `HTTP ${res.status}`;
    return {
      state: "degraded",
      port: daemonState.port,
      statusCode: res.status,
      detail,
    };
  } catch (err) {
    const alive = typeof daemonState.pid === "number" ? isProcessAlive(daemonState.pid) : false;
    if (alive) {
      return {
        state: "degraded",
        port: daemonState.port,
        detail: `Daemon process ${daemonState.pid} is alive but /health is unreachable.`,
      };
    }
    return {
      state: "stopped",
      port: daemonState.port,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

type DaemonTargetOpts = {
  url?: string;
  token?: string;
};

async function gatewayCall<T>(
  method: string,
  params: Record<string, unknown>,
  opts: DaemonTargetOpts,
): Promise<T> {
  const rpc = await daemonRequest<
    | { ok: true; result: T }
    | { ok: false; error: { code: string; message: string } }
  >("/gateway", {
    url: opts.url,
    token: opts.token,
    method: "POST",
    body: { method, params },
  });
  if (!rpc.ok) {
    throw new Error(rpc.error.message);
  }
  return rpc.result;
}

function parseChannelSnapshot(raw: unknown): ChannelSecuritySnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const channelId = typeof value.channelId === "string" ? value.channelId : "";
  if (!channelId) return null;
  const status = value.status;
  const dmPolicy = value.dmPolicy;
  if (
    status !== "connected" &&
    status !== "awaiting_scan" &&
    status !== "error" &&
    status !== "offline"
  ) {
    return null;
  }
  if (
    dmPolicy !== "pairing" &&
    dmPolicy !== "allowlist" &&
    dmPolicy !== "open" &&
    dmPolicy !== "disabled"
  ) {
    return null;
  }
  const diagnostics = Array.isArray(value.diagnostics)
    ? value.diagnostics
      .filter((entry): entry is { code: string; severity: "info" | "warn" | "error"; message: string; recovery?: string } => {
        if (!entry || typeof entry !== "object") return false;
        const diagnostic = entry as Record<string, unknown>;
        if (typeof diagnostic.code !== "string" || typeof diagnostic.message !== "string") return false;
        return diagnostic.severity === "info" || diagnostic.severity === "warn" || diagnostic.severity === "error";
      })
      .map((entry) => ({
        code: entry.code,
        severity: entry.severity,
        message: entry.message,
        recovery: entry.recovery,
      }))
    : [];

  return {
    channelId,
    configured: value.configured === true,
    enabled: value.enabled === true,
    connected: value.connected === true,
    status,
    dmPolicy,
    allowlistCount: typeof value.allowlistCount === "number" ? value.allowlistCount : 0,
    diagnostics,
  };
}

function buildSecuritySnapshots(payload: GatewayChannelsStatusResult): ChannelSecuritySnapshot[] {
  const snapshotsMap = payload.channelSnapshots ?? {};
  const channelsMeta = payload.channels ?? {};
  const channelOrder = payload.channelOrder ?? Object.keys(snapshotsMap);

  const snapshots: ChannelSecuritySnapshot[] = [];
  for (const channelId of channelOrder) {
    const parsed = parseChannelSnapshot(snapshotsMap[channelId]);
    if (!parsed) continue;
    const channelMeta = channelsMeta[channelId];
    if (channelMeta && typeof channelMeta === "object" && !Array.isArray(channelMeta)) {
      const meta = channelMeta as Record<string, unknown>;
      parsed.pairingPending = typeof meta.pairingPending === "number" ? meta.pairingPending : 0;
      parsed.pairingApproved = typeof meta.pairingApproved === "number" ? meta.pairingApproved : 0;
    } else {
      parsed.pairingPending = 0;
      parsed.pairingApproved = 0;
    }
    snapshots.push(parsed);
  }
  return snapshots;
}

async function resolveGatewayDiagnostics(
  daemonStatus: DaemonStatusSummary,
  opts: { all?: boolean; url?: string; token?: string },
): Promise<GatewayDiagnostics | undefined> {
  if (!opts.all) return undefined;
  if (!opts.url && daemonStatus.state === "stopped") {
    return { error: "Daemon is stopped. Start it before requesting extended diagnostics." };
  }

  const token = opts.token?.trim() || resolveSavedDaemonToken(DEFAULT_PATHS);
  const target: DaemonTargetOpts = {
    url: opts.url,
    token,
  };

  try {
    const [gatewayStatus, channelsStatus] = await Promise.all([
      gatewayCall<GatewayStatusResult>("status", {}, target),
      gatewayCall<GatewayChannelsStatusResult>("channels.status", {}, target),
    ]);
    const snapshots = buildSecuritySnapshots(channelsStatus);
    const findings = collectChannelSecurityFindings(snapshots);
    const security = summarizeChannelSecurity(snapshots, findings);
    const connected = snapshots.filter((snapshot) => snapshot.connected).length;
    const pendingPairing = snapshots.reduce((acc, snapshot) => acc + (snapshot.pairingPending ?? 0), 0);
    const approvedPairing = snapshots.reduce((acc, snapshot) => acc + (snapshot.pairingApproved ?? 0), 0);

    return {
      scheduler: gatewayStatus.scheduler,
      channels: {
        total: snapshots.length,
        connected,
        pendingPairing,
        approvedPairing,
        security,
        findings,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function hasDirectoryAccess(target: string): boolean {
  try {
    fs.readdirSync(target);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return true;
    return false;
  }
}

function checkAuthState(paths: DaemonPaths = DEFAULT_PATHS): { configured: boolean; providersWithKeys: number; envKeys: string[] } {
  const envKeys = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENROUTER_API_KEY",
  ].filter((key) => Boolean(process.env[key]?.trim()));

  let providersWithKeys = 0;
  try {
    const raw = fs.readFileSync(paths.providersFile, "utf-8").trim();
    if (raw) {
      const parsed = JSON.parse(raw) as {
        providers?: Array<{ apiKey?: unknown; apiKeyEncrypted?: unknown }>;
      };
      providersWithKeys = (parsed.providers ?? []).filter((provider) => {
        const plain = typeof provider.apiKey === "string" && provider.apiKey.trim().length > 0;
        const encrypted = typeof provider.apiKeyEncrypted === "string" && provider.apiKeyEncrypted.trim().length > 0;
        return plain || encrypted;
      }).length;
    }
  } catch {
    // best effort only
  }

  return {
    configured: envKeys.length > 0 || providersWithKeys > 0,
    providersWithKeys,
    envKeys,
  };
}

export function statusCommand(): Command {
  return new Command("status")
    .description("Show Undoable system status and permissions")
    .option("--all", "Include scheduler/channel diagnostics from gateway", false)
    .option("--url <url>", "Daemon base URL (for --all diagnostics)")
    .option("--token <token>", "Daemon bearer token (for --all diagnostics)")
    .option("--json", "Output as JSON")
    .action(async (opts: { all?: boolean; url?: string; token?: string; json?: boolean }) => {
      const info: Record<string, unknown> = {};
      const daemonPort = resolveDaemonPort(DEFAULT_PATHS);

      info.platform = `${os.type()} ${os.release()} (${os.arch()})`;
      info.node = process.version;
      info.home = DEFAULT_PATHS.home;

      const daemonStatus = await resolveDaemonStatus(DEFAULT_PATHS);
      info.daemon = daemonStatus.state;
      info.daemonPort = daemonPort;
      info.daemonHealth = {
        ready: daemonStatus.ready,
        authRequired: daemonStatus.authRequired === true,
        statusCode: daemonStatus.statusCode,
        checks: daemonStatus.checks,
        detail: daemonStatus.detail,
      };
      const gateway = await resolveGatewayDiagnostics(daemonStatus, {
        all: opts.all,
        url: opts.url,
        token: opts.token,
      });
      if (gateway) {
        info.gateway = gateway;
      }

      const perms: Record<string, boolean> = {};
      if (process.platform === "darwin") {
        for (const dir of ["Downloads", "Desktop", "Documents"]) {
          perms[dir] = hasDirectoryAccess(path.join(DEFAULT_PATHS.home, dir));
        }
      }
      info.permissions = perms;
      info.fullDiskAccess =
        Object.values(perms).length === 0 || Object.values(perms).every(Boolean);

      const auth = checkAuthState(DEFAULT_PATHS);
      info.auth = {
        configured: auth.configured,
        providersWithKeys: auth.providersWithKeys,
        envKeys: auth.envKeys,
      };

      if (opts.json) {
        console.log(JSON.stringify(info, null, 2));
        return;
      }

      console.log("");
      console.log(`${BOLD}  Undoable Status${NC}`);
      console.log("");
      console.log(`  Platform:   ${info.platform}`);
      console.log(`  Node.js:    ${info.node}`);
      const daemonColor =
        daemonStatus.state === "running"
          ? GREEN
          : daemonStatus.state === "degraded"
            ? YELLOW
            : RED;
      console.log(`  Daemon:     ${daemonColor}${daemonStatus.state}${NC}`);
      console.log(`  Port:       ${daemonPort}`);
      if (daemonStatus.authRequired) {
        console.log(`  Daemon API: ${YELLOW}token required${NC}`);
      } else if (daemonStatus.ready === false) {
        console.log(`  Ready:      ${YELLOW}no${NC}`);
      } else if (daemonStatus.ready === true) {
        console.log(`  Ready:      ${GREEN}yes${NC}`);
      }
      if (daemonStatus.detail) {
        console.log(`  Detail:     ${daemonStatus.detail}`);
      }
      console.log(
        `  Auth:       ${auth.configured ? GREEN + "configured" + NC : YELLOW + "not set" + NC}`,
      );
      if (auth.providersWithKeys > 0) {
        console.log(`  Providers:  ${auth.providersWithKeys} with saved keys`);
      }

      if (gateway) {
        console.log("");
        console.log(`${BOLD}  Extended Diagnostics${NC}`);
        if (gateway.error) {
          console.log(`  Gateway:    ${YELLOW}${gateway.error}${NC}`);
        } else {
          if (gateway.scheduler) {
            const nextWake = typeof gateway.scheduler.nextWakeAtMs === "number"
              ? new Date(gateway.scheduler.nextWakeAtMs).toISOString()
              : "n/a";
            console.log(`  Scheduler:  jobs=${gateway.scheduler.jobCount ?? 0} nextWake=${nextWake}`);
          }
          if (gateway.channels) {
            console.log(
              `  Channels:   connected=${gateway.channels.connected}/${gateway.channels.total} pendingPairing=${gateway.channels.pendingPairing}`,
            );
            const summary = gateway.channels.security;
            const securityColor = summary.error > 0 ? RED : summary.warn > 0 ? YELLOW : GREEN;
            console.log(
              `  Security:   ${securityColor}errors=${summary.error} warn=${summary.warn} okChannels=${summary.okChannels}${NC}`,
            );
            for (const finding of gateway.channels.findings.slice(0, 5)) {
              console.log(`    - [${finding.severity}] ${finding.channelId}: ${finding.message}`);
            }
          }
        }
      }

      if (Object.keys(perms).length > 0) {
        console.log("");
        console.log(`${BOLD}  Permissions${NC}`);
        const fdaOk = Object.values(perms).every(Boolean);
        console.log(`  Full Disk:  ${fdaOk ? GREEN + "granted" + NC : RED + "not granted" + NC}`);
        for (const [dir, ok] of Object.entries(perms)) {
          console.log(`    ${ok ? GREEN + "✓" : RED + "✗"} ~/${dir}${NC}`);
        }
        if (!fdaOk) {
          console.log(`\n  ${YELLOW}Run ${BOLD}nrn setup --fix${NC}${YELLOW} to fix permissions${NC}`);
        }
      }
      console.log("");
    });
}
