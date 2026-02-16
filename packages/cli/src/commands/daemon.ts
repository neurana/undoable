import { Command } from "commander";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_PORT = 7433;
const PID_FILE = path.join(os.homedir(), ".undoable", "daemon.pid.json");

type DaemonState = {
  pid: number;
  port: number;
  startedAt: string;
};

function parsePort(raw: string | undefined): number {
  const parsed = Number.parseInt(String(raw ?? DEFAULT_PORT), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port: ${raw}`);
  }
  return parsed;
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
    .option("-p, --port <port>", "Port to listen on", "7433")
    .option("--json", "Output raw JSON", false)
    .option("--wait-ms <ms>", "How long to wait for daemon health", "6000")
    .action(async (opts: { port?: string; json?: boolean; waitMs?: string }) => {
      try {
        const port = parsePort(opts.port);
        const existing = readState();

        if (existing && isProcessRunning(existing.pid) && await checkHealth(existing.port)) {
          const already = {
            running: true,
            pid: existing.pid,
            port: existing.port,
            url: daemonUrl(existing.port),
            startedAt: existing.startedAt,
            reused: true,
          };
          if (opts.json) {
            console.log(JSON.stringify(already, null, 2));
            return;
          }
          console.log(`Daemon already running (pid ${existing.pid}) on ${already.url}`);
          return;
        }

        const rootDir = path.resolve(import.meta.dirname, "../../../..");
        const daemonEntry = path.join(rootDir, "packages/daemon/src/index.ts");
        const child = spawn("node", ["--import", "tsx", daemonEntry], {
          cwd: rootDir,
          detached: true,
          stdio: "ignore",
          env: {
            ...process.env,
            NRN_PORT: String(port),
          },
        });
        child.unref();

        const state: DaemonState = {
          pid: child.pid ?? -1,
          port,
          startedAt: new Date().toISOString(),
        };

        if (state.pid <= 0) {
          throw new Error("Failed to start daemon process (invalid pid)");
        }

        writeState(state);

        const waitMs = Math.max(0, Number.parseInt(String(opts.waitMs ?? "6000"), 10) || 6000);
        const healthy = waitMs > 0 ? await waitForHealth(port, waitMs) : await checkHealth(port);

        const out = {
          running: isProcessRunning(state.pid),
          healthy,
          pid: state.pid,
          port,
          url: daemonUrl(port),
          startedAt: state.startedAt,
        };

        if (opts.json) {
          console.log(JSON.stringify(out, null, 2));
          return;
        }

        if (healthy) {
          console.log(`Daemon started (pid ${state.pid}) at ${out.url}`);
        } else {
          console.log(`Daemon process started (pid ${state.pid}), but health check is not ready yet.`);
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
    .option("--wait-ms <ms>", "How long to wait for graceful shutdown", "5000")
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

        process.kill(state.pid, "SIGTERM");
        const waitMs = Math.max(0, Number.parseInt(String(opts.waitMs ?? "5000"), 10) || 5000);
        const exited = waitMs > 0 ? await waitForExit(state.pid, waitMs) : !isProcessRunning(state.pid);

        if (!exited) {
          process.kill(state.pid, "SIGKILL");
        }

        removeState();
        const out = {
          stopped: true,
          pid: state.pid,
          forced: !exited,
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
        const state = readState();
        const fallbackPort = opts.port ? parsePort(opts.port) : DEFAULT_PORT;
        const port = state?.port ?? fallbackPort;
        const pid = state?.pid;
        const processRunning = typeof pid === "number" ? isProcessRunning(pid) : false;
        const healthy = await checkHealth(port);

        if (state && !processRunning) {
          removeState();
        }

        const out = {
          running: processRunning,
          healthy,
          pid: processRunning ? pid : null,
          port,
          url: daemonUrl(port),
          managed: Boolean(state),
          startedAt: state?.startedAt,
        };

        if (opts.json) {
          console.log(JSON.stringify(out, null, 2));
          return;
        }

        const statusLabel = out.running ? "running" : "stopped";
        const healthLabel = out.healthy ? "ok" : "down";
        const pidLabel = out.pid ?? "-";
        console.log(`Daemon: ${statusLabel}`);
        console.log(`Health: ${healthLabel}`);
        console.log(`PID: ${pidLabel}`);
        console.log(`URL: ${out.url}`);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  return cmd;
}
