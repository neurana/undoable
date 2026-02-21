import { Command } from "commander";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@undoable/core";
import { getDaemonServiceStatus, restartDaemonService } from "./daemon-service.js";
import {
  inferDaemonBindMode,
  repairDaemonSettingsSecurityProfile,
  type DaemonSettingsShape,
} from "./doctor-repair.js";

type CheckResult = { name: string; ok: boolean; detail: string };
type DaemonStateFile = {
  pid?: unknown;
  port?: unknown;
  logFile?: unknown;
};
type DaemonHealthProbe = {
  ok: boolean;
  port: number;
  url: string;
  statusCode?: number;
  error?: string;
};
type RepairAction = {
  name: string;
  applied: boolean;
  detail: string;
};

const HOME = os.homedir();
const DEFAULT_DAEMON_PORT = 7433;
const PID_FILE = path.join(HOME, ".undoable", "daemon.pid.json");
const DAEMON_SETTINGS_FILE = path.join(HOME, ".undoable", "daemon-settings.json");
const LOG_DIR = path.join(HOME, ".undoable", "logs");
const DEFAULT_DAEMON_LOG = path.join(LOG_DIR, "daemon.log");
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export function doctorCommand(): Command {
  return new Command("doctor")
    .description("Diagnose your Undoable setup")
    .option("--fix", "Attempt safe automatic repairs before reporting", false)
    .option("--json", "Output machine-readable diagnostics")
    .action(async (opts: { fix?: boolean; json?: boolean }) => {
      let repairActions: RepairAction[] = [];
      if (opts.fix) {
        repairActions = await runSafeRepairs();
      }
      const checks = await runChecks();
      const passed = checks.filter((c) => c.ok).length;
      const failed = checks.filter((c) => !c.ok).length;

      if (opts.json) {
        console.log(JSON.stringify({
          checks,
          summary: { passed, failed },
          repairs: repairActions,
        }, null, 2));
        if (failed > 0) process.exitCode = 1;
        return;
      }

      if (repairActions.length > 0) {
        console.log("  Repair actions:");
        for (const action of repairActions) {
          const icon = action.applied ? "✓" : "•";
          console.log(`  ${icon} ${action.name}: ${action.detail}`);
        }
        console.log("");
      }

      for (const check of checks) {
        const icon = check.ok ? "✓" : "✗";
        console.log(`  ${icon} ${check.name}: ${check.detail}`);
      }

      console.log(`\n${passed} passed, ${failed} failed`);
      if (failed > 0) process.exitCode = 1;
    });
}

async function runChecks(): Promise<CheckResult[]> {
  const health = await probeDaemonHealth();
  const daemonChecks = await Promise.all([
    checkDaemonHealth(health),
    checkDaemonSecurityProfile(),
    checkDaemonPortConflict(health),
    checkDaemonServiceRuntime(health),
    checkDaemonLogPaths(health),
  ]);
  return [
    checkNode(),
    checkDocker(),
    checkGit(),
    checkConfig(),
    checkConfigDir(),
    ...daemonChecks,
  ];
}

function writeDaemonSettingsFile(settings: DaemonSettingsShape): void {
  fs.mkdirSync(path.dirname(DAEMON_SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(DAEMON_SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
}

async function runSafeRepairs(): Promise<RepairAction[]> {
  const actions: RepairAction[] = [];

  try {
    fs.mkdirSync(path.join(HOME, ".undoable"), { recursive: true });
    actions.push({
      name: "State directory",
      applied: true,
      detail: "Ensured ~/.undoable exists.",
    });
  } catch (err) {
    actions.push({
      name: "State directory",
      applied: false,
      detail: `Failed to create ~/.undoable (${err instanceof Error ? err.message : String(err)}).`,
    });
  }

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    actions.push({
      name: "Log directory",
      applied: true,
      detail: `Ensured ${LOG_DIR} exists.`,
    });
  } catch (err) {
    actions.push({
      name: "Log directory",
      applied: false,
      detail: `Failed to create ${LOG_DIR} (${err instanceof Error ? err.message : String(err)}).`,
    });
  }

  const settingsExists = fs.existsSync(DAEMON_SETTINGS_FILE);
  let settings: DaemonSettingsShape = {};
  if (settingsExists) {
    try {
      const raw = fs.readFileSync(DAEMON_SETTINGS_FILE, "utf-8").trim();
      settings = raw.length > 0 ? (JSON.parse(raw) as DaemonSettingsShape) : {};
      if (!settings || typeof settings !== "object") settings = {};
    } catch (err) {
      actions.push({
        name: "Daemon settings security profile",
        applied: false,
        detail: `Skipped: invalid daemon-settings.json (${err instanceof Error ? err.message : String(err)}).`,
      });
      settings = {};
    }
  }

  if (!settingsExists || Object.keys(settings).length > 0) {
    const repaired = repairDaemonSettingsSecurityProfile(settings);
    if (repaired.changed) {
      try {
        writeDaemonSettingsFile(repaired.settings);
        actions.push({
          name: "Daemon settings security profile",
          applied: true,
          detail: repaired.notes.join(" "),
        });
      } catch (err) {
        actions.push({
          name: "Daemon settings security profile",
          applied: false,
          detail: `Failed to write daemon settings (${err instanceof Error ? err.message : String(err)}).`,
        });
      }
    }
  }

  try {
    const health = await probeDaemonHealth();
    const status = getDaemonServiceStatus(resolveRootDir());
    if (status.installed && status.active && !health.ok) {
      restartDaemonService(resolveRootDir());
      actions.push({
        name: "Daemon service restart",
        applied: true,
        detail: "Service was active but unhealthy; restarted service.",
      });
    }
  } catch (err) {
    actions.push({
      name: "Daemon service restart",
      applied: false,
      detail: `Unable to restart daemon service (${err instanceof Error ? err.message : String(err)}).`,
    });
  }

  return actions;
}

function checkNode(): CheckResult {
  try {
    const version = process.version;
    const major = Number.parseInt(version.slice(1), 10);
    return { name: "Node.js", ok: major >= 22, detail: `${version} (need >= 22)` };
  } catch {
    return { name: "Node.js", ok: false, detail: "not found" };
  }
}

function checkDocker(): CheckResult {
  try {
    const version = execFileSync("docker", ["--version"], { encoding: "utf-8", timeout: 5000 }).trim();
    return { name: "Docker", ok: true, detail: version };
  } catch {
    return { name: "Docker", ok: false, detail: "not found or not running" };
  }
}

function checkGit(): CheckResult {
  try {
    const version = execFileSync("git", ["--version"], { encoding: "utf-8", timeout: 5000 }).trim();
    return { name: "Git", ok: true, detail: version };
  } catch {
    return { name: "Git", ok: false, detail: "not found" };
  }
}

function checkConfig(): CheckResult {
  const { config, errors } = loadConfig(process.cwd());
  if (errors.length > 0) {
    return { name: "Config", ok: false, detail: errors.join("; ") };
  }
  return {
    name: "Config",
    ok: true,
    detail: `port=${config.daemon.port}, provider=${config.llm.defaultProvider}`,
  };
}

function checkConfigDir(): CheckResult {
  const dir = path.join(HOME, ".undoable");
  if (fs.existsSync(dir)) {
    return { name: "Config dir", ok: true, detail: dir };
  }
  return {
    name: "Config dir",
    ok: true,
    detail: `${dir} not created yet (will be created on first run)`,
  };
}

function parseDaemonState(): DaemonStateFile | null {
  try {
    const raw = fs.readFileSync(PID_FILE, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DaemonStateFile;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseDaemonPort(state = parseDaemonState()): number {
  const raw = state?.port;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1 && raw <= 65535) {
    return Math.floor(raw);
  }
  return DEFAULT_DAEMON_PORT;
}

function resolveSavedDaemonToken(): string | undefined {
  const envToken = process.env.UNDOABLE_TOKEN?.replace(/^Bearer\s+/i, "").trim();
  if (envToken) return envToken;
  const settings = parseDaemonSettingsFile();
  if (!settings) return undefined;
  const authMode = typeof settings.authMode === "string"
    ? settings.authMode.trim().toLowerCase()
    : "open";
  if (authMode !== "token") return undefined;
  const token = typeof settings.token === "string" ? settings.token.trim() : "";
  return token.length > 0 ? token : undefined;
}

async function probeDaemonHealth(): Promise<DaemonHealthProbe> {
  const state = parseDaemonState();
  const port = parseDaemonPort(state);
  const url = `http://127.0.0.1:${port}/health`;
  const token = resolveSavedDaemonToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(1500),
    });
    return {
      ok: response.ok,
      port,
      url,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      port,
      url,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkDaemonHealth(probe: DaemonHealthProbe): Promise<CheckResult> {
  if (probe.ok) {
    return { name: "Daemon health", ok: true, detail: `${probe.url} reachable` };
  }
  return {
    name: "Daemon health",
    ok: false,
    detail: `${probe.url} unreachable (${probe.error ?? "unknown error"})`,
  };
}

function parseDaemonSettingsFile(): DaemonSettingsShape | null {
  try {
    if (!fs.existsSync(DAEMON_SETTINGS_FILE)) return null;
    const raw = fs.readFileSync(DAEMON_SETTINGS_FILE, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DaemonSettingsShape;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function checkDaemonSecurityProfile(): Promise<CheckResult> {
  const settings = parseDaemonSettingsFile();
  if (!settings) {
    return {
      name: "Daemon profile",
      ok: true,
      detail: "no daemon-settings.json yet (defaults: loopback, open auth)",
    };
  }

  const bindMode = inferDaemonBindMode(settings);
  const authMode = typeof settings.authMode === "string"
    ? settings.authMode.trim().toLowerCase()
    : "open";
  const token = typeof settings.token === "string" ? settings.token.trim() : "";
  const securityPolicy = typeof settings.securityPolicy === "string"
    ? settings.securityPolicy.trim().toLowerCase()
    : "balanced";

  if (authMode === "token" && token.length === 0) {
    return {
      name: "Daemon profile",
      ok: false,
      detail: "authMode=token but token is empty in daemon settings",
    };
  }

  if (bindMode !== "loopback" && authMode !== "token") {
    return {
      name: "Daemon profile",
      ok: false,
      detail:
        `bindMode=${bindMode} with authMode=${authMode} is unsafe for remote exposure; use token auth`,
    };
  }

  return {
    name: "Daemon profile",
    ok: true,
    detail: `bindMode=${bindMode}, authMode=${authMode}, securityPolicy=${securityPolicy}`,
  };
}

async function probeLoopbackPortAvailability(
  port: number,
): Promise<{ free: boolean; reason?: string }> {
  return await new Promise((resolve) => {
    const server = net.createServer();
    const finish = (free: boolean, reason?: string) => {
      try {
        server.close();
      } catch {
        // best effort
      }
      resolve({ free, reason });
    };

    server.once("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EADDRINUSE") {
        finish(false, "port is already in use");
        return;
      }
      finish(false, code ?? String(err));
    });

    server.listen({ port, host: "127.0.0.1" }, () => {
      finish(true);
    });
  });
}

function listPortListeners(port: number): string[] {
  try {
    const output = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"],
      { encoding: "utf-8", timeout: 3000 },
    );
    const lines = output.trim().split(/\r?\n/).slice(1);
    return lines.slice(0, 3).map((line) => {
      const cols = line.trim().split(/\s+/);
      const command = cols[0] ?? "process";
      const pid = cols[1] ?? "?";
      const target = cols.at(-1) ?? "";
      return `${command}(pid=${pid}) ${target}`.trim();
    });
  } catch {
    return [];
  }
}

async function checkDaemonPortConflict(
  probe: DaemonHealthProbe,
): Promise<CheckResult> {
  if (probe.ok) {
    return {
      name: "Daemon port",
      ok: true,
      detail: `port ${probe.port} is serving health`,
    };
  }

  const availability = await probeLoopbackPortAvailability(probe.port);
  if (availability.free) {
    return {
      name: "Daemon port",
      ok: true,
      detail: `port ${probe.port} is free (daemon is simply not running)`,
    };
  }

  const listeners = listPortListeners(probe.port);
  const listenerDetail = listeners.length > 0
    ? ` listeners: ${listeners.join(", ")}`
    : "";
  return {
    name: "Daemon port",
    ok: false,
    detail:
      `port ${probe.port} is occupied while daemon health is down` +
      (availability.reason ? ` (${availability.reason})` : "") +
      listenerDetail,
  };
}

function resolveRootDir(): string {
  return path.resolve(MODULE_DIR, "../../../..");
}

async function checkDaemonServiceRuntime(
  probe: DaemonHealthProbe,
): Promise<CheckResult> {
  try {
    const rootDir = resolveRootDir();
    const status = getDaemonServiceStatus(rootDir);
    if (!status.installed) {
      return {
        name: "Daemon service runtime",
        ok: true,
        detail: `${status.platform} service not installed`,
      };
    }

    const distEntry = path.join(rootDir, "dist", "daemon", "index.mjs");
    if (!fs.existsSync(distEntry)) {
      return {
        name: "Daemon service runtime",
        ok: false,
        detail:
          `Service is installed but built daemon entry is missing at ${distEntry}. ` +
          "Run `pnpm build` and reinstall/restart the daemon service.",
      };
    }

    if (status.active && !probe.ok) {
      return {
        name: "Daemon service runtime",
        ok: false,
        detail:
          `Service reports active but health is down on ${probe.url}. ` +
          "Check service logs and restart the service.",
      };
    }

    return {
      name: "Daemon service runtime",
      ok: true,
      detail: `${status.platform} installed=${status.installed ? "yes" : "no"} active=${status.active ? "yes" : "no"}`,
    };
  } catch (err) {
    return {
      name: "Daemon service runtime",
      ok: true,
      detail: `status unavailable (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

async function checkDaemonLogPaths(
  probe: DaemonHealthProbe,
): Promise<CheckResult> {
  if (!fs.existsSync(LOG_DIR)) {
    return {
      name: "Daemon logs",
      ok: true,
      detail: `${LOG_DIR} not created yet`,
    };
  }

  try {
    fs.accessSync(LOG_DIR, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err) {
    return {
      name: "Daemon logs",
      ok: false,
      detail: `log directory is not readable/writable (${err instanceof Error ? err.message : String(err)})`,
    };
  }

  const state = parseDaemonState();
  const stateLogFile = typeof state?.logFile === "string" ? state.logFile.trim() : "";
  const expectedLog = stateLogFile || DEFAULT_DAEMON_LOG;

  if (!fs.existsSync(expectedLog)) {
    if (probe.ok) {
      return {
        name: "Daemon logs",
        ok: false,
        detail: `daemon is healthy but log file is missing at ${expectedLog}`,
      };
    }
    return {
      name: "Daemon logs",
      ok: true,
      detail: `log file not created yet (${expectedLog})`,
    };
  }

  try {
    fs.accessSync(expectedLog, fs.constants.R_OK);
    const stat = fs.statSync(expectedLog);
    return {
      name: "Daemon logs",
      ok: true,
      detail: `${expectedLog} readable (${stat.size} bytes)`,
    };
  } catch (err) {
    return {
      name: "Daemon logs",
      ok: false,
      detail: `log file exists but is not readable (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}
