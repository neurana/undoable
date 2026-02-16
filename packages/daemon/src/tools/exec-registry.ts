import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type ProcessStatus = "running" | "completed" | "failed" | "killed";

export type PtyHandle = {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  pid: number;
  onData(cb: (data: string) => void): void;
  onExit(cb: (ev: { exitCode: number; signal?: number }) => void): void;
};

export type ProcessSession = {
  id: string;
  command: string;
  pid?: number;
  startedAt: number;
  cwd?: string;
  child?: ChildProcess;
  ptyHandle?: PtyHandle;
  isPty: boolean;
  aggregated: string;
  tail: string;
  totalOutputChars: number;
  maxOutputChars: number;
  exited: boolean;
  exitCode?: number | null;
  exitSignal?: NodeJS.Signals | null;
  backgrounded: boolean;
  truncated: boolean;
  recovered?: boolean;
};

export type FinishedSession = {
  id: string;
  command: string;
  startedAt: number;
  endedAt: number;
  cwd?: string;
  status: ProcessStatus;
  exitCode?: number | null;
  exitSignal?: NodeJS.Signals | null;
  aggregated: string;
  tail: string;
  truncated: boolean;
};

const MAX_TAIL_CHARS = 4000;
const MAX_OUTPUT_CHARS = 200_000;
const JOB_TTL_MS = 30 * 60 * 1000;
const PERSIST_DEBOUNCE_MS = 250;
const DEFAULT_STATE_FILE = path.join(os.homedir(), ".undoable", "exec-sessions.json");

type PersistedRunningSession = {
  id: string;
  command: string;
  pid?: number;
  startedAt: number;
  cwd?: string;
  isPty: boolean;
  aggregated: string;
  tail: string;
  totalOutputChars: number;
  maxOutputChars: number;
  exitCode?: number | null;
  exitSignal?: NodeJS.Signals | null;
  backgrounded: boolean;
  truncated: boolean;
};

type PersistedExecRegistryState = {
  version: 1;
  running: PersistedRunningSession[];
  finished: FinishedSession[];
  savedAtMs: number;
};

export type ExecRegistryRecoveryResult = {
  runningRecovered: number;
  finishedRecovered: number;
  staleRunningDropped: number;
};

const runningSessions = new Map<string, ProcessSession>();
const finishedSessions = new Map<string, FinishedSession>();
let sweeper: NodeJS.Timeout | null = null;
let persistTimer: NodeJS.Timeout | null = null;

function stopSweeperIfEmpty(): void {
  if (!sweeper) return;
  if (runningSessions.size > 0 || finishedSessions.size > 0) return;
  clearInterval(sweeper);
  sweeper = null;
}

function resolveStateFilePath(): string {
  const customPath = process.env.UNDOABLE_EXEC_STATE_FILE?.trim();
  if (customPath) return path.resolve(customPath);
  return DEFAULT_STATE_FILE;
}

function isPidAlive(pid: number | undefined): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function refreshRecoveredSession(session: ProcessSession): void {
  if (session.exited) return;
  if (session.child || session.ptyHandle) return;
  if (!session.recovered) return;
  if (isPidAlive(session.pid)) return;
  markExited(session, null, null);
}

function serializeRunningSession(session: ProcessSession): PersistedRunningSession {
  return {
    id: session.id,
    command: session.command,
    pid: session.pid,
    startedAt: session.startedAt,
    cwd: session.cwd,
    isPty: session.isPty,
    aggregated: session.aggregated,
    tail: session.tail,
    totalOutputChars: session.totalOutputChars,
    maxOutputChars: session.maxOutputChars,
    exitCode: session.exitCode,
    exitSignal: session.exitSignal,
    backgrounded: session.backgrounded,
    truncated: session.truncated,
  };
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistStateNow();
  }, PERSIST_DEBOUNCE_MS);
}

function persistStateNow(): void {
  try {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }

    const state: PersistedExecRegistryState = {
      version: 1,
      running: [...runningSessions.values()].map(serializeRunningSession),
      finished: [...finishedSessions.values()],
      savedAtMs: Date.now(),
    };

    const stateFilePath = resolveStateFilePath();
    const dir = path.dirname(stateFilePath);
    fs.mkdirSync(dir, { recursive: true });

    const tempPath = `${stateFilePath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tempPath, stateFilePath);
    try {
      fs.chmodSync(stateFilePath, 0o600);
    } catch {
      // best effort
    }
  } catch {
    // best effort persistence; never fail exec lifecycle
  }
}

export function recoverExecRegistryState(): ExecRegistryRecoveryResult {
  const result: ExecRegistryRecoveryResult = {
    runningRecovered: 0,
    finishedRecovered: 0,
    staleRunningDropped: 0,
  };

  runningSessions.clear();
  finishedSessions.clear();
  stopSweeperIfEmpty();
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }

  try {
    const stateFilePath = resolveStateFilePath();
    if (!fs.existsSync(stateFilePath)) {
      return result;
    }
    const raw = fs.readFileSync(stateFilePath, "utf-8").trim();
    if (!raw) {
      return result;
    }

    const parsed = JSON.parse(raw) as PersistedExecRegistryState;

    if (Array.isArray(parsed.finished)) {
      const now = Date.now();
      for (const session of parsed.finished) {
        if (!session || typeof session.id !== "string") continue;
        if (now - session.endedAt > JOB_TTL_MS) continue;
        finishedSessions.set(session.id, session);
        result.finishedRecovered++;
      }
    }

    if (Array.isArray(parsed.running)) {
      for (const session of parsed.running) {
        if (!session || typeof session.id !== "string") continue;

        if (!isPidAlive(session.pid)) {
          result.staleRunningDropped++;
          const endedAt = Date.now();
          finishedSessions.set(session.id, {
            id: session.id,
            command: session.command,
            startedAt: session.startedAt,
            endedAt,
            cwd: session.cwd,
            status: "failed",
            exitCode: null,
            exitSignal: null,
            aggregated: session.aggregated,
            tail: session.tail,
            truncated: session.truncated,
          });
          continue;
        }

        runningSessions.set(session.id, {
          id: session.id,
          command: session.command,
          pid: session.pid,
          startedAt: session.startedAt,
          cwd: session.cwd,
          isPty: session.isPty,
          aggregated: session.aggregated,
          tail: session.tail,
          totalOutputChars: session.totalOutputChars,
          maxOutputChars: session.maxOutputChars || MAX_OUTPUT_CHARS,
          exited: false,
          exitCode: session.exitCode,
          exitSignal: session.exitSignal,
          backgrounded: true,
          truncated: session.truncated,
          recovered: true,
        });
        result.runningRecovered++;
      }
    }

    if (runningSessions.size > 0 || finishedSessions.size > 0) {
      startSweeper();
      persistStateNow();
    }
  } catch {
    // ignore corrupt or unreadable state files
  }

  return result;
}

function startSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    let removed = false;
    for (const [id, s] of finishedSessions) {
      if (now - s.endedAt > JOB_TTL_MS) {
        finishedSessions.delete(id);
        removed = true;
      }
    }
    if (removed) schedulePersist();
    if (finishedSessions.size === 0 && runningSessions.size === 0) {
      clearInterval(sweeper!);
      sweeper = null;
    }
  }, 60_000);
}

let counter = 0;
export function createSessionId(): string {
  counter++;
  const ts = Date.now().toString(36);
  const seq = counter.toString(36).padStart(3, "0");
  return `${ts}-${seq}`;
}

export function addSession(session: ProcessSession) {
  runningSessions.set(session.id, session);
  startSweeper();
  schedulePersist();
}

export function getSession(id: string): ProcessSession | undefined {
  const session = runningSessions.get(id);
  if (session) refreshRecoveredSession(session);
  return runningSessions.get(id);
}

export function getFinishedSession(id: string): FinishedSession | undefined {
  return finishedSessions.get(id);
}

export function listRunningSessions(): ProcessSession[] {
  for (const session of runningSessions.values()) {
    refreshRecoveredSession(session);
  }
  return [...runningSessions.values()];
}

export function listFinishedSessions(): FinishedSession[] {
  return [...finishedSessions.values()];
}

export function deleteSession(id: string) {
  const deletedRunning = runningSessions.delete(id);
  const deletedFinished = finishedSessions.delete(id);
  stopSweeperIfEmpty();
  if (deletedRunning || deletedFinished) schedulePersist();
}

export function appendOutput(session: ProcessSession, data: string) {
  if (session.exited) return;
  session.totalOutputChars += data.length;
  if (session.totalOutputChars > session.maxOutputChars) {
    session.truncated = true;
  }
  session.aggregated += data;
  if (session.aggregated.length > session.maxOutputChars) {
    session.aggregated = session.aggregated.slice(-session.maxOutputChars);
    session.truncated = true;
  }
  session.tail = session.aggregated.slice(-MAX_TAIL_CHARS);
  schedulePersist();
}

export function markExited(
  session: ProcessSession,
  code: number | null,
  signal: NodeJS.Signals | null,
) {
  if (session.exited) return;
  session.exited = true;
  session.exitCode = code;
  session.exitSignal = signal;
  runningSessions.delete(session.id);
  const isSuccess = code === 0 && !signal;
  const wasKilled = signal === "SIGTERM" || signal === "SIGKILL";
  finishedSessions.set(session.id, {
    id: session.id,
    command: session.command,
    startedAt: session.startedAt,
    endedAt: Date.now(),
    cwd: session.cwd,
    status: isSuccess ? "completed" : wasKilled ? "killed" : "failed",
    exitCode: code,
    exitSignal: signal,
    aggregated: session.aggregated,
    tail: session.tail,
    truncated: session.truncated,
  });
  schedulePersist();
}

export function markBackgrounded(session: ProcessSession) {
  session.backgrounded = true;
  schedulePersist();
}

export function writeStdin(sessionId: string, data: string): boolean {
  const session = runningSessions.get(sessionId);
  if (!session || session.exited) return false;
  if (session.ptyHandle) {
    session.ptyHandle.write(data);
    return true;
  }
  if (session.child?.stdin && !session.child.stdin.destroyed) {
    session.child.stdin.write(data);
    return true;
  }
  return false;
}

export function resizePty(sessionId: string, cols: number, rows: number): boolean {
  const session = runningSessions.get(sessionId);
  if (!session || session.exited || !session.ptyHandle) return false;
  session.ptyHandle.resize(cols, rows);
  return true;
}

export function killSession(session: ProcessSession) {
  if (session.exited) return;
  try {
    if (session.ptyHandle) {
      session.ptyHandle.kill("SIGTERM");
      setTimeout(() => {
        if (!session.exited) {
          try { session.ptyHandle?.kill("SIGKILL"); } catch { }
        }
      }, 3000);
    } else if (session.child && !session.child.killed) {
      session.child.kill("SIGTERM");
      setTimeout(() => {
        if (!session.exited && session.child && !session.child.killed) {
          session.child.kill("SIGKILL");
        }
      }, 3000);
    } else if (isPidAlive(session.pid)) {
      process.kill(session.pid!, "SIGTERM");
      setTimeout(() => {
        if (!session.exited && !isPidAlive(session.pid)) {
          markExited(session, null, "SIGTERM");
        }
      }, 400);
      setTimeout(() => {
        if (!session.exited && isPidAlive(session.pid)) {
          try {
            process.kill(session.pid!, "SIGKILL");
          } catch {
            // ignore race where process already exited
          }
        }
      }, 3000);
      setTimeout(() => {
        if (!session.exited && !isPidAlive(session.pid)) {
          markExited(session, null, "SIGKILL");
        }
      }, 3400);
    }
  } catch { }
}

/** Strip DSR (Device Status Report) escape sequences from PTY output. */
export function stripDsrSequences(input: string): string {
  return input.replace(/\x1b\[\d+;\d+R/g, "");
}

export function waitForExit(sessionId: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const session = runningSessions.get(sessionId);
      if (session) {
        refreshRecoveredSession(session);
      }
      const current = runningSessions.get(sessionId);
      if (!current || current.exited) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}

export { MAX_OUTPUT_CHARS };
