import type { ChildProcess } from "node:child_process";

export type ProcessStatus = "running" | "completed" | "failed" | "killed";

export type ProcessSession = {
  id: string;
  command: string;
  pid?: number;
  startedAt: number;
  cwd?: string;
  child?: ChildProcess;
  aggregated: string;
  tail: string;
  totalOutputChars: number;
  maxOutputChars: number;
  exited: boolean;
  exitCode?: number | null;
  exitSignal?: NodeJS.Signals | null;
  backgrounded: boolean;
  truncated: boolean;
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

const runningSessions = new Map<string, ProcessSession>();
const finishedSessions = new Map<string, FinishedSession>();
let sweeper: NodeJS.Timeout | null = null;

function startSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of finishedSessions) {
      if (now - s.endedAt > JOB_TTL_MS) finishedSessions.delete(id);
    }
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
}

export function getSession(id: string): ProcessSession | undefined {
  return runningSessions.get(id);
}

export function getFinishedSession(id: string): FinishedSession | undefined {
  return finishedSessions.get(id);
}

export function listRunningSessions(): ProcessSession[] {
  return [...runningSessions.values()];
}

export function listFinishedSessions(): FinishedSession[] {
  return [...finishedSessions.values()];
}

export function deleteSession(id: string) {
  runningSessions.delete(id);
  finishedSessions.delete(id);
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
  finishedSessions.set(session.id, {
    id: session.id,
    command: session.command,
    startedAt: session.startedAt,
    endedAt: Date.now(),
    cwd: session.cwd,
    status: isSuccess ? "completed" : "failed",
    exitCode: code,
    exitSignal: signal,
    aggregated: session.aggregated,
    tail: session.tail,
    truncated: session.truncated,
  });
}

export function markBackgrounded(session: ProcessSession) {
  session.backgrounded = true;
}

export function killSession(session: ProcessSession) {
  if (session.exited) return;
  try {
    if (session.child && !session.child.killed) {
      session.child.kill("SIGTERM");
      setTimeout(() => {
        if (!session.exited && session.child && !session.child.killed) {
          session.child.kill("SIGKILL");
        }
      }, 3000);
    }
  } catch { }
}

export function waitForExit(sessionId: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const session = runningSessions.get(sessionId);
      if (!session || session.exited) {
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
