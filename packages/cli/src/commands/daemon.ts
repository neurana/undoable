import { Command } from "commander";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDaemonServiceStatus,
  installDaemonService,
  restartDaemonService,
  startDaemonService,
  stopDaemonService,
  uninstallDaemonService,
  type DaemonServiceStatus,
} from "./daemon-service.js";
import { daemonRequest } from "./daemon-client.js";

const DEFAULT_PORT = 7433;
const PID_FILE = path.join(os.homedir(), ".undoable", "daemon.pid.json");
const DAEMON_SETTINGS_FILE = path.join(os.homedir(), ".undoable", "daemon-settings.json");
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WAIT_MS = 6000;
const DEFAULT_STOP_WAIT_MS = 5000;
const DEFAULT_RESTART_DELAY_MS = 1500;
const DEFAULT_MAX_RESTARTS = 0;

type DaemonState = {
  pid: number;
  port: number;
  startedAt: string;
  supervised?: boolean;
  logFile?: string;
};

type DaemonLaunchSettings = {
  host: string;
  port: number;
  authMode: "open" | "token";
  token: string;
  securityPolicy: "strict" | "balanced" | "permissive";
};

function parsePort(raw: string | undefined): number {
  const parsed = Number.parseInt(String(raw ?? DEFAULT_PORT), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port: ${raw}`);
  }
  return parsed;
}

function readDaemonLaunchSettings(): DaemonLaunchSettings {
  const fallback: DaemonLaunchSettings = {
    host: "127.0.0.1",
    port: DEFAULT_PORT,
    authMode: "open",
    token: "",
    securityPolicy: "balanced",
  };
  try {
    if (!fs.existsSync(DAEMON_SETTINGS_FILE)) return fallback;
    const raw = fs.readFileSync(DAEMON_SETTINGS_FILE, "utf-8").trim();
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DaemonLaunchSettings>;
    const host = typeof parsed.host === "string" && parsed.host.trim().length > 0
      ? parsed.host.trim()
      : fallback.host;
    const port = typeof parsed.port === "number"
      ? parsePort(String(parsed.port))
      : fallback.port;
    const authMode = parsed.authMode === "token" ? "token" : "open";
    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    const securityPolicy =
      parsed.securityPolicy === "strict" ||
      parsed.securityPolicy === "balanced" ||
      parsed.securityPolicy === "permissive"
        ? parsed.securityPolicy
        : fallback.securityPolicy;
    return { host, port, authMode, token, securityPolicy };
  } catch {
    return fallback;
  }
}

function daemonUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function ensureStateDir() {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
}

function writeState(state: DaemonState) {
  ensureStateDir();
  fs.writeFileSync(PID_FILE, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
}

function readState(): DaemonState | null {
  try {
    const raw = fs.readFileSync(PID_FILE, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DaemonState>;
    if (typeof parsed.pid !== "number" || typeof parsed.port !== "number") return null;
    return {
      pid: parsed.pid,
      port: parsed.port,
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : new Date().toISOString(),
      supervised: parsed.supervised === true,
      logFile: typeof parsed.logFile === "string" ? parsed.logFile : undefined,
    };
  } catch {
    return null;
  }
}

function removeState() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    // best effort
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!isProcessRunning(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !isProcessRunning(pid);
}

function parseOptionalInt(raw: string | undefined, fallback: number): number {
  if (typeof raw !== "string" || raw.trim().length === 0) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function resolveRootDir(): string {
  return path.resolve(MODULE_DIR, "../../../..");
}

function printServiceStatus(status: DaemonServiceStatus): void {
  console.log(`Platform: ${status.platform}`);
  console.log(`Service: ${status.serviceId}`);
  console.log(`Unit: ${status.unitPath}`);
  console.log(`Installed: ${status.installed ? "yes" : "no"}`);
  console.log(`Enabled: ${status.enabled ? "yes" : "no"}`);
  console.log(`Active: ${status.active ? "yes" : "no"}`);
  console.log(`Logs: ${status.logsHint}`);
  if (status.detail) {
    console.log(`Detail: ${status.detail}`);
  }
}

function signalManagedProcess(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
    return;
  } catch {
    // fall back to direct PID
  }
  process.kill(pid, signal);
}

async function checkHealth(port: number): Promise<boolean> {
  try {
    const res = await fetch(`${daemonUrl(port)}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(port: number, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await checkHealth(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return checkHealth(port);
}

export function daemonCommand(): Command {
  const cmd = new Command("daemon").description("Manage the nrn-agentd daemon");

  cmd
    .command("start")
    .description("Start the daemon")
    .option("-p, --port <port>", "Port to listen on")
    .option("--host <host>", "Host/interface to bind (defaults to daemon settings)")
    .option("--json", "Output raw JSON", false)
    .option("--wait-ms <ms>", "How long to wait for daemon health", String(DEFAULT_WAIT_MS))
    .option("--supervise", "Keep daemon alive with auto-restart if it crashes", true)
    .option("--max-restarts <n>", "Supervisor restart limit (0 = unlimited)", String(DEFAULT_MAX_RESTARTS))
    .option("--restart-delay-ms <ms>", "Delay before restart after a crash", String(DEFAULT_RESTART_DELAY_MS))
    .action(async (opts: {
      port?: string;
      host?: string;
      json?: boolean;
      waitMs?: string;
      supervise?: boolean;
      maxRestarts?: string;
      restartDelayMs?: string;
    }) => {
      try {
        const daemonSettings = readDaemonLaunchSettings();
        const port = parsePort(opts.port ?? String(daemonSettings.port));
        const host = opts.host?.trim() || daemonSettings.host;
        const authMode = daemonSettings.authMode;
        const token = authMode === "token" ? daemonSettings.token : "";
        const securityPolicy = daemonSettings.securityPolicy;
        const waitMs = Math.max(0, parseOptionalInt(opts.waitMs, DEFAULT_WAIT_MS));
        const existing = readState();

        if (existing && isProcessRunning(existing.pid)) {
          const healthy = waitMs > 0
            ? await waitForHealth(existing.port, waitMs)
            : await checkHealth(existing.port);
          const already = {
            running: true,
            healthy,
            pid: existing.pid,
            port: existing.port,
            url: daemonUrl(existing.port),
            startedAt: existing.startedAt,
            supervised: existing.supervised === true,
            logFile: existing.logFile,
            reused: true,
          };
          if (opts.json) {
            console.log(JSON.stringify(already, null, 2));
            return;
          }
          if (healthy) {
            console.log(`Daemon already running (pid ${existing.pid}) on ${already.url}`);
            return;
          }
          console.log(`Daemon process ${existing.pid} is running but unhealthy on ${already.url}.`);
          console.log("Run `nrn daemon stop` first, then retry `nrn daemon start`.");
          process.exitCode = 1;
          return;
        }
        if (existing) {
          removeState();
        }

        const rootDir = resolveRootDir();
        const daemonEntry = path.join(rootDir, "packages/daemon/src/index.ts");
        const logFile = path.join(os.homedir(), ".undoable", "logs", "daemon.log");
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        const supervise = opts.supervise !== false;
        const maxRestarts = Math.max(0, parseOptionalInt(opts.maxRestarts, DEFAULT_MAX_RESTARTS));
        const restartDelayMs = Math.max(
          250,
          parseOptionalInt(opts.restartDelayMs, DEFAULT_RESTART_DELAY_MS),
        );
        const child = supervise
          ? spawn(
              "node",
              ["--import", "tsx", path.join(rootDir, "packages/cli/src/commands/daemon-supervisor.ts")],
              {
                cwd: rootDir,
                detached: true,
                stdio: "ignore",
                env: {
                  ...process.env,
                  NRN_PORT: String(port),
                  NRN_HOST: host,
                  UNDOABLE_TOKEN: token,
                  UNDOABLE_SECURITY_POLICY: securityPolicy,
                  NRN_DAEMON_ENTRY: daemonEntry,
                  NRN_DAEMON_CWD: rootDir,
                  NRN_DAEMON_LOG_FILE: logFile,
                  NRN_SUPERVISOR_MAX_RESTARTS: String(maxRestarts),
                  NRN_SUPERVISOR_RESTART_DELAY_MS: String(restartDelayMs),
                },
              },
            )
          : spawn("node", ["--import", "tsx", daemonEntry], {
              cwd: rootDir,
              detached: true,
              stdio: "ignore",
              env: {
                ...process.env,
                NRN_PORT: String(port),
                NRN_HOST: host,
                UNDOABLE_TOKEN: token,
                UNDOABLE_SECURITY_POLICY: securityPolicy,
              },
            });
        child.unref();

        const state: DaemonState = {
          pid: child.pid ?? -1,
          port,
          startedAt: new Date().toISOString(),
          supervised: supervise,
          logFile,
        };

        if (state.pid <= 0) {
          throw new Error("Failed to start daemon process (invalid pid)");
        }

        writeState(state);

        const healthy = waitMs > 0 ? await waitForHealth(port, waitMs) : await checkHealth(port);

        const out = {
          running: isProcessRunning(state.pid),
          healthy,
          pid: state.pid,
          port,
          host,
          url: daemonUrl(port),
          startedAt: state.startedAt,
          supervised: state.supervised === true,
          logFile: state.logFile,
          authMode,
          securityPolicy,
        };

        if (opts.json) {
          console.log(JSON.stringify(out, null, 2));
          return;
        }

        if (healthy) {
          const mode = supervise ? "supervised" : "direct";
          console.log(`Daemon started (pid ${state.pid}, ${mode}) at ${out.url} [host=${host}]`);
          console.log(`Auth: ${authMode}${authMode === "token" ? " (token required)" : " (open)"}`);
          console.log(`Security policy: ${securityPolicy}`);
          if (out.logFile) {
            console.log(`Logs: ${out.logFile}`);
          }
        } else {
          console.log(`Daemon process started (pid ${state.pid}), but health check is not ready yet.`);
          if (out.logFile) {
            console.log(`Check logs: ${out.logFile}`);
          }
          process.exitCode = 1;
        }
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  cmd
    .command("stop")
    .description("Stop the daemon")
    .option("--json", "Output raw JSON", false)
    .option("--wait-ms <ms>", "How long to wait for graceful shutdown", String(DEFAULT_STOP_WAIT_MS))
    .action(async (opts: { json?: boolean; waitMs?: string }) => {
      try {
        const state = readState();
        if (!state) {
          const out = { stopped: false, reason: "not-managed" };
          if (opts.json) {
            console.log(JSON.stringify(out, null, 2));
            return;
          }
          console.log("Daemon is not managed by nrn daemon start (no pid state file).");
          return;
        }

        const running = isProcessRunning(state.pid);
        if (!running) {
          removeState();
          const out = { stopped: true, pid: state.pid, stale: true };
          if (opts.json) {
            console.log(JSON.stringify(out, null, 2));
            return;
          }
          console.log(`Removed stale daemon state for pid ${state.pid}.`);
          return;
        }

        signalManagedProcess(state.pid, "SIGTERM");
        const waitMs = Math.max(0, parseOptionalInt(opts.waitMs, DEFAULT_STOP_WAIT_MS));
        const exited = waitMs > 0 ? await waitForExit(state.pid, waitMs) : !isProcessRunning(state.pid);

        if (!exited) {
          signalManagedProcess(state.pid, "SIGKILL");
        }

        removeState();
        const out = {
          stopped: true,
          pid: state.pid,
          forced: !exited,
          supervised: state.supervised === true,
        };

        if (opts.json) {
          console.log(JSON.stringify(out, null, 2));
          return;
        }

        console.log(!exited
          ? `Daemon ${state.pid} force-stopped.`
          : `Daemon ${state.pid} stopped.`);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  cmd
    .command("status")
    .description("Show daemon status")
    .option("-p, --port <port>", "Port to check when no pid state exists")
    .option("--json", "Output raw JSON", false)
    .action(async (opts: { port?: string; json?: boolean }) => {
      try {
        const daemonSettings = readDaemonLaunchSettings();
        const state = readState();
        const fallbackPort = opts.port
          ? parsePort(opts.port)
          : daemonSettings.port;
        const port = state?.port ?? fallbackPort;
        const pid = state?.pid;
        const processRunning = typeof pid === "number" ? isProcessRunning(pid) : false;
        const healthy = await checkHealth(port);

        if (state && !processRunning) {
          removeState();
        }

        const managed = Boolean(state && processRunning);
        const external = !managed && healthy;
        const running = managed || external;

        const out = {
          running,
          healthy,
          pid: managed ? pid : null,
          port,
          url: daemonUrl(port),
          managed,
          external,
          startedAt: state?.startedAt,
          supervised: state?.supervised === true,
          logFile: state?.logFile,
        };

        if (opts.json) {
          console.log(JSON.stringify(out, null, 2));
          return;
        }

        const statusLabel = out.running ? "running" : "stopped";
        const healthLabel = out.healthy ? "ok" : "down";
        const pidLabel = out.pid ?? "-";
        const sourceLabel = out.managed
          ? "managed"
          : out.external
            ? "external"
            : "none";
        console.log(`Daemon: ${statusLabel}`);
        console.log(`Source: ${sourceLabel}`);
        console.log(`Health: ${healthLabel}`);
        console.log(`PID: ${pidLabel}`);
        console.log(`URL: ${out.url}`);
        if (out.managed) {
          console.log(`Mode: ${out.supervised ? "supervised" : "direct"}`);
        }
        if (out.logFile) {
          console.log(`Logs: ${out.logFile}`);
        }
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  cmd
    .command("mode [mode]")
    .description(
      "Get or set daemon operation mode (normal, drain, paused)",
    )
    .option("--reason <reason>", "Optional operator reason when setting mode")
    .option("--url <url>", "Daemon base URL (default http://127.0.0.1:7433)")
    .option("--token <token>", "Daemon auth token")
    .option("--json", "Output raw JSON", false)
    .action(
      async (opts: {
        mode?: string;
        reason?: string;
        url?: string;
        token?: string;
        json?: boolean;
      }) => {
        try {
          const requestedMode = opts.mode?.trim().toLowerCase();
          const validModes = new Set(["normal", "drain", "paused"]);
          if (requestedMode && !validModes.has(requestedMode)) {
            throw new Error("mode must be one of: normal, drain, paused");
          }
          const response = requestedMode
            ? await daemonRequest<{
                mode: "normal" | "drain" | "paused";
                reason: string;
                updatedAt: string;
              }>("/control/operation", {
                url: opts.url,
                token: opts.token,
                method: "PATCH",
                body: { mode: requestedMode, reason: opts.reason ?? "" },
              })
            : await daemonRequest<{
                mode: "normal" | "drain" | "paused";
                reason: string;
                updatedAt: string;
              }>("/control/operation", {
                url: opts.url,
                token: opts.token,
              });

          if (opts.json) {
            console.log(JSON.stringify(response, null, 2));
            return;
          }

          console.log(`Mode: ${response.mode}`);
          if (response.reason) {
            console.log(`Reason: ${response.reason}`);
          }
          console.log(`Updated: ${response.updatedAt}`);
        } catch (err) {
          console.error(String(err));
          process.exitCode = 1;
        }
      },
    );

  const serviceCmd = cmd
    .command("service")
    .description("Manage daemon OS service (launchd on macOS, systemd --user on Linux)");

  serviceCmd
    .command("install")
    .description("Install and enable daemon service")
    .option("-p, --port <port>", "Port to run daemon on", "7433")
    .option("--no-start", "Install but do not start immediately")
    .option("--json", "Output raw JSON", false)
    .action((opts: { port?: string; start?: boolean; json?: boolean }) => {
      try {
        const rootDir = resolveRootDir();
        const status = installDaemonService(rootDir, {
          port: parsePort(opts.port),
          startNow: opts.start !== false,
        });
        if (opts.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }
        console.log("Daemon service installed.");
        printServiceStatus(status);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  serviceCmd
    .command("uninstall")
    .description("Uninstall daemon service")
    .option("--json", "Output raw JSON", false)
    .action((opts: { json?: boolean }) => {
      try {
        const rootDir = resolveRootDir();
        const status = uninstallDaemonService(rootDir);
        if (opts.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }
        console.log("Daemon service uninstalled.");
        printServiceStatus(status);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  serviceCmd
    .command("start")
    .description("Start daemon service")
    .option("--json", "Output raw JSON", false)
    .action((opts: { json?: boolean }) => {
      try {
        const rootDir = resolveRootDir();
        const status = startDaemonService(rootDir);
        if (opts.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }
        console.log("Daemon service started.");
        printServiceStatus(status);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  serviceCmd
    .command("stop")
    .description("Stop daemon service")
    .option("--json", "Output raw JSON", false)
    .action((opts: { json?: boolean }) => {
      try {
        const rootDir = resolveRootDir();
        const status = stopDaemonService(rootDir);
        if (opts.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }
        console.log("Daemon service stopped.");
        printServiceStatus(status);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  serviceCmd
    .command("restart")
    .description("Restart daemon service")
    .option("--json", "Output raw JSON", false)
    .action((opts: { json?: boolean }) => {
      try {
        const rootDir = resolveRootDir();
        const status = restartDaemonService(rootDir);
        if (opts.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }
        console.log("Daemon service restarted.");
        printServiceStatus(status);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  serviceCmd
    .command("status")
    .description("Show daemon service status")
    .option("--json", "Output raw JSON", false)
    .action((opts: { json?: boolean }) => {
      try {
        const rootDir = resolveRootDir();
        const status = getDaemonServiceStatus(rootDir);
        if (opts.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }
        printServiceStatus(status);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  return cmd;
}
