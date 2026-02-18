import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_RESTART_DELAY_MS = 1500;
const DEFAULT_SHUTDOWN_GRACE_MS = 5000;

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (typeof raw !== "string" || raw.trim().length === 0) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function resolveRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

const daemonEntry = resolveRequiredEnv("NRN_DAEMON_ENTRY");
const daemonCwd = process.env.NRN_DAEMON_CWD?.trim() || process.cwd();
const daemonPort = process.env.NRN_PORT?.trim() || "7433";
const restartDelayMs = Math.max(
  250,
  parseNonNegativeInt(
    process.env.NRN_SUPERVISOR_RESTART_DELAY_MS,
    DEFAULT_RESTART_DELAY_MS,
  ),
);
const maxRestarts = parseNonNegativeInt(process.env.NRN_SUPERVISOR_MAX_RESTARTS, 0);
const logFile = process.env.NRN_DAEMON_LOG_FILE?.trim();

let logFd: number | null = null;
if (logFile) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  logFd = fs.openSync(logFile, "a");
}

function writeLog(message: string): void {
  if (logFd === null) return;
  const line = `[${new Date().toISOString()}] [supervisor] ${message}\n`;
  try {
    fs.writeSync(logFd, line);
  } catch {
    // best-effort logging
  }
}

let activeChild: ChildProcess | null = null;
let restartCount = 0;
let shuttingDown = false;
let shutdownTimer: NodeJS.Timeout | null = null;

function closeLogFd(): void {
  if (logFd === null) return;
  try {
    fs.closeSync(logFd);
  } catch {
    // best effort
  } finally {
    logFd = null;
  }
}

function exitSupervisor(code: number): never {
  closeLogFd();
  process.exit(code);
}

function onChildExit(
  code: number | null,
  signal: NodeJS.Signals | null,
): void {
  activeChild = null;
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }

  if (shuttingDown) {
    writeLog(`child exited during shutdown code=${code ?? "null"} signal=${signal ?? "null"}`);
    exitSupervisor(0);
  }

  const cleanExit = code === 0 || signal === "SIGINT" || signal === "SIGTERM";
  if (cleanExit) {
    writeLog(`child exited cleanly code=${code ?? "null"} signal=${signal ?? "null"}`);
    exitSupervisor(0);
  }

  restartCount += 1;
  if (maxRestarts > 0 && restartCount > maxRestarts) {
    writeLog(`child crashed too many times (${restartCount}); giving up`);
    exitSupervisor(1);
  }

  writeLog(
    `child crashed code=${code ?? "null"} signal=${signal ?? "null"}; restarting in ${restartDelayMs}ms`,
  );
  setTimeout(() => {
    if (!shuttingDown) {
      startChild();
    }
  }, restartDelayMs).unref();
}

function startChild(): void {
  if (shuttingDown) return;

  const child = spawn("node", ["--import", "tsx", daemonEntry], {
    cwd: daemonCwd,
    env: {
      ...process.env,
      NRN_PORT: daemonPort,
    },
    stdio: logFd === null ? "ignore" : ["ignore", logFd, logFd],
  });
  activeChild = child;
  writeLog(`child started pid=${child.pid ?? "unknown"}`);
  child.once("exit", onChildExit);
}

function beginShutdown(source: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  writeLog(`shutdown requested via ${source}`);

  if (!activeChild) {
    exitSupervisor(0);
  }

  try {
    activeChild.kill("SIGTERM");
  } catch {
    // process may have already exited
  }

  shutdownTimer = setTimeout(() => {
    if (activeChild && !activeChild.killed) {
      try {
        activeChild.kill("SIGKILL");
      } catch {
        // best effort
      }
    }
    exitSupervisor(0);
  }, DEFAULT_SHUTDOWN_GRACE_MS);
  shutdownTimer.unref();
}

process.on("SIGINT", () => beginShutdown("SIGINT"));
process.on("SIGTERM", () => beginShutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  writeLog(`uncaughtException: ${String(err)}`);
  beginShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  writeLog(`unhandledRejection: ${String(reason)}`);
  beginShutdown("unhandledRejection");
});

writeLog(
  `boot daemonEntry=${daemonEntry} port=${daemonPort} restartDelayMs=${restartDelayMs} maxRestarts=${maxRestarts}`,
);
startChild();
