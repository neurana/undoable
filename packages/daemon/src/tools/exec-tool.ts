import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentTool } from "./types.js";
import { validateEnv, isDestructiveCommand } from "./exec-security.js";
import { type ExecAllowlistConfig, loadAllowlistConfig, evaluateCommand } from "./exec-allowlist.js";
import type { SandboxExecService } from "../services/sandbox-exec.js";
import {
  type PtyHandle,
  addSession,
  appendOutput,
  createSessionId,
  markExited,
  markBackgrounded,
  stripDsrSequences,
  MAX_OUTPUT_CHARS,
} from "./exec-registry.js";

const DEFAULT_TIMEOUT_SEC = 120;
const DEFAULT_YIELD_MS = 10_000;
const HOME = os.homedir();
const SHELL_CANDIDATES = ["/bin/zsh", "/bin/bash", "/bin/sh"];

type ExecIsolationMode = "off" | "prefer" | "require";

function resolveExecIsolationMode(): ExecIsolationMode {
  const raw = (process.env.UNDOABLE_EXEC_ISOLATION ?? "prefer").trim().toLowerCase();
  if (raw === "off" || raw === "prefer" || raw === "require") return raw;
  return "prefer";
}

function buildSandboxSessionId(baseSessionId: string, cwd: string): string {
  const digest = createHash("sha256").update(cwd).digest("hex").slice(0, 12);
  return `${baseSessionId}:${digest}`;
}

function getShell(): { shell: string; args: string[] } {
  if (process.platform === "win32") return { shell: "cmd.exe", args: ["/c"] };
  const preferred = process.env.SHELL;
  if (preferred && existsSync(preferred)) return { shell: preferred, args: ["-c"] };
  for (const candidate of SHELL_CANDIDATES) {
    if (existsSync(candidate)) return { shell: candidate, args: ["-c"] };
  }
  return { shell: "/bin/sh", args: ["-c"] };
}

/** Try to load node-pty at runtime. Returns null if not installed. */
async function tryLoadNodePty(): Promise<{
  spawn: (
    file: string,
    args: string[],
    opts: { name?: string; cols?: number; rows?: number; cwd?: string; env?: Record<string, string> },
  ) => PtyHandle;
} | null> {
  try {
    // @ts-expect-error — node-pty is an optional peer dependency, loaded dynamically
    const mod = await import("node-pty");
    return {
      spawn: (file, args, opts) => {
        const pty = mod.spawn(file, args, {
          name: opts.name ?? "xterm-256color",
          cols: opts.cols ?? 120,
          rows: opts.rows ?? 30,
          cwd: opts.cwd,
          env: opts.env as Record<string, string>,
        });
        return {
          pid: pty.pid,
          write: (data: string) => pty.write(data),
          resize: (cols: number, rows: number) => pty.resize(cols, rows),
          kill: (signal?: string) => pty.kill(signal),
          onData: (cb: (data: string) => void) => pty.onData(cb),
          onExit: (cb: (ev: { exitCode: number; signal?: number }) => void) => pty.onExit(cb),
        };
      },
    };
  } catch {
    return null;
  }
}

export function createExecTool(opts?: {
  allowlistConfig?: ExecAllowlistConfig;
  sandboxExec?: SandboxExecService;
  sandboxSessionId?: string;
}): AgentTool {
  const allowlistConfig = opts?.allowlistConfig ?? loadAllowlistConfig();
  const isolationMode = resolveExecIsolationMode();
  const sandboxBaseSessionId = (opts?.sandboxSessionId ?? "global").trim() || "global";
  return {
    name: "exec",
    definition: {
      type: "function",
      function: {
        name: "exec",
        description: [
          "Execute a shell command. Supports background execution for long-running commands.",
          "Returns stdout/stderr and exit code. Use for installing packages, running scripts, git, system tasks.",
          "Set pty=true for interactive CLI tools that need terminal features (colors, prompts, curses).",
          "Use the process tool to write stdin, poll output, or kill running sessions.",
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command to execute" },
            cwd: { type: "string", description: "Working directory (default: home)" },
            timeout: { type: "number", description: "Timeout in seconds (default: 120)" },
            background: { type: "boolean", description: "Run in background immediately" },
            yieldMs: {
              type: "number",
              description: "Ms to wait before backgrounding (default: 10000)",
            },
            env: { type: "object", description: "Extra environment variables" },
            pty: {
              type: "boolean",
              description: "Run in a pseudo-terminal (PTY) for interactive commands. Requires node-pty.",
            },
            cols: { type: "number", description: "PTY columns (default: 120)" },
            rows: { type: "number", description: "PTY rows (default: 30)" },
          },
          required: ["command"],
        },
      },
    },
    execute: async (args) => {
      const command = args.command as string;
      if (!command?.trim()) throw new Error("command is required");

      const rawCwd = (args.cwd as string) || HOME;
      const cwd = path.resolve(rawCwd);
      const timeoutSec = (args.timeout as number) || DEFAULT_TIMEOUT_SEC;
      const backgroundRequested = args.background === true;
      const usePty = args.pty === true;
      const yieldMs = backgroundRequested
        ? 0
        : typeof args.yieldMs === "number"
          ? Math.max(10, Math.min(args.yieldMs as number, 120_000))
          : DEFAULT_YIELD_MS;

      const extraEnv = (args.env as Record<string, string>) || {};
      if (Object.keys(extraEnv).length > 0) validateEnv(extraEnv);

      if (isDestructiveCommand(command)) {
        return {
          error: "Blocked: this command appears destructive. Confirm with the user first.",
          command,
        };
      }

      if (allowlistConfig.security !== "full") {
        const evaluation = evaluateCommand(command, allowlistConfig);
        if (!evaluation.allowed) {
          return {
            error: `Blocked by exec security (mode: ${allowlistConfig.security}): ${evaluation.reason}`,
            command,
            hint: "Use the 'actions' tool with approval_mode to adjust security, or add the command to the allowlist.",
          };
        }
      }

      if (!existsSync(cwd)) {
        return {
          error: `Working directory does not exist: ${cwd}`,
          command,
          hint: "Create the directory first or use a different cwd.",
        };
      }

      const sandboxAvailable = Boolean(opts?.sandboxExec?.available);
      if (isolationMode === "require" && !sandboxAvailable) {
        return {
          error: "Blocked by exec isolation policy: sandbox is required but unavailable.",
          command,
          hint: "Install/start Docker or set UNDOABLE_EXEC_ISOLATION=prefer to allow host fallback.",
        };
      }

      const requiresInteractiveHost = usePty || backgroundRequested;
      if (isolationMode === "require" && requiresInteractiveHost) {
        return {
          error: "Blocked by exec isolation policy: interactive/background exec is not supported in sandbox mode.",
          command,
          hint: "Run a foreground non-PTY command or set UNDOABLE_EXEC_ISOLATION=prefer for host fallback.",
        };
      }

      /* ── Sandbox path ── */
      if (opts?.sandboxExec && sandboxAvailable && isolationMode !== "off" && !requiresInteractiveHost) {
        const sandboxSessionId = buildSandboxSessionId(sandboxBaseSessionId, cwd);
        try {
          await opts.sandboxExec.ensureSandbox(sandboxSessionId, cwd);
          const result = await opts.sandboxExec.exec(sandboxSessionId, {
            command,
            cwd: "/workspace",
            timeout: timeoutSec * 1000,
            env: Object.keys(extraEnv).length > 0 ? extraEnv : undefined,
          });
          return {
            exitCode: result.exitCode,
            stdout: result.stdout.slice(0, 8000),
            stderr: result.stderr.slice(0, 8000),
            status: result.exitCode === 0 ? "completed" : "failed",
            sandbox: true,
          };
        } catch (err) {
          return { error: `Sandbox exec failed: ${(err as Error).message}`, command };
        }
      }

      /* ── PTY path ── */
      if (usePty) {
        const ptyMod = await tryLoadNodePty();
        if (!ptyMod) {
          return {
            error: "PTY mode requested but node-pty is not installed. Install it with: pnpm add node-pty",
            command,
          };
        }

        const { shell } = getShell();
        const sessionId = createSessionId();
        const startedAt = Date.now();
        const cols = (args.cols as number) ?? 120;
        const rows = (args.rows as number) ?? 30;

        const ptyHandle = ptyMod.spawn(shell, ["-c", command], {
          name: "xterm-256color",
          cols,
          rows,
          cwd,
          env: { ...process.env, ...extraEnv } as Record<string, string>,
        });

        const session = {
          id: sessionId,
          command,
          pid: ptyHandle.pid,
          startedAt,
          cwd,
          ptyHandle,
          isPty: true,
          aggregated: "",
          tail: "",
          totalOutputChars: 0,
          maxOutputChars: MAX_OUTPUT_CHARS,
          exited: false,
          exitCode: undefined as number | null | undefined,
          exitSignal: undefined as NodeJS.Signals | null | undefined,
          backgrounded: false,
          truncated: false,
        };
        addSession(session);

        ptyHandle.onData((data) => {
          const cleaned = stripDsrSequences(data);
          if (cleaned) appendOutput(session, cleaned);
        });

        let timeoutTimer: NodeJS.Timeout | null = null;
        if (timeoutSec > 0) {
          timeoutTimer = setTimeout(() => {
            if (!session.exited) {
              try { ptyHandle.kill("SIGKILL"); } catch { }
            }
          }, timeoutSec * 1000);
        }

        const exitPromise = new Promise<{
          status: "completed" | "failed";
          exitCode: number | null;
          durationMs: number;
          output: string;
        }>((resolve) => {
          ptyHandle.onExit((ev) => {
            if (timeoutTimer) clearTimeout(timeoutTimer);
            markExited(session, ev.exitCode, null);
            resolve({
              status: ev.exitCode === 0 ? "completed" : "failed",
              exitCode: ev.exitCode,
              durationMs: Date.now() - startedAt,
              output: session.aggregated.trim(),
            });
          });
        });

        if (backgroundRequested || yieldMs === 0) {
          markBackgrounded(session);
          return {
            status: "running",
            sessionId,
            pid: ptyHandle.pid,
            pty: true,
            message: `PTY session running in background (session ${sessionId}). Use process tool to poll/write/kill.`,
          };
        }

        const raceResult = await Promise.race([
          exitPromise,
          new Promise<"yield">((resolve) => setTimeout(() => resolve("yield"), yieldMs)),
        ]);

        if (raceResult === "yield") {
          markBackgrounded(session);
          return {
            status: "running",
            sessionId,
            pid: ptyHandle.pid,
            pty: true,
            tail: session.tail,
            message: `PTY still running after ${yieldMs}ms (session ${sessionId}). Use process tool to poll/write/kill.`,
          };
        }

        return {
          exitCode: raceResult.exitCode,
          stdout: raceResult.output.slice(0, 8000),
          status: raceResult.status,
          durationMs: raceResult.durationMs,
          pty: true,
          truncated: raceResult.output.length > 8000,
        };
      }

      /* ── Standard shell path ── */
      const { shell, args: shellArgs } = getShell();
      const sessionId = createSessionId();
      const startedAt = Date.now();

      const child = spawn(shell, [...shellArgs, command], {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...extraEnv },
        detached: process.platform !== "win32",
      });

      const session = {
        id: sessionId,
        command,
        pid: child.pid,
        startedAt,
        cwd,
        child,
        isPty: false,
        aggregated: "",
        tail: "",
        totalOutputChars: 0,
        maxOutputChars: MAX_OUTPUT_CHARS,
        exited: false,
        exitCode: undefined as number | null | undefined,
        exitSignal: undefined as NodeJS.Signals | null | undefined,
        backgrounded: false,
        truncated: false,
      };
      addSession(session);

      child.stdout?.on("data", (data) => appendOutput(session, data.toString()));
      child.stderr?.on("data", (data) => appendOutput(session, data.toString()));

      let timeoutTimer: NodeJS.Timeout | null = null;
      if (timeoutSec > 0) {
        timeoutTimer = setTimeout(() => {
          if (!session.exited) {
            try { child.kill("SIGKILL"); } catch { }
          }
        }, timeoutSec * 1000);
      }

      const exitPromise = new Promise<{
        status: "completed" | "failed";
        exitCode: number | null;
        durationMs: number;
        output: string;
        timedOut: boolean;
      }>((resolve) => {
        child.on("close", (code, signal) => {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          markExited(session, code, signal);
          const durationMs = Date.now() - startedAt;
          const isSuccess = code === 0 && !signal;
          resolve({
            status: isSuccess ? "completed" : "failed",
            exitCode: code,
            durationMs,
            output: session.aggregated.trim(),
            timedOut: false,
          });
        });

        child.on("error", (err) => {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          markExited(session, null, null);
          resolve({
            status: "failed",
            exitCode: null,
            durationMs: Date.now() - startedAt,
            output: err.message,
            timedOut: false,
          });
        });
      });

      if (backgroundRequested || yieldMs === 0) {
        markBackgrounded(session);
        return {
          status: "running",
          sessionId,
          pid: child.pid,
          message: `Command running in background (session ${sessionId}). Use process tool to poll/kill.`,
        };
      }

      const raceResult = await Promise.race([
        exitPromise,
        new Promise<"yield">((resolve) => setTimeout(() => resolve("yield"), yieldMs)),
      ]);

      if (raceResult === "yield") {
        markBackgrounded(session);
        return {
          status: "running",
          sessionId,
          pid: child.pid,
          tail: session.tail,
          message: `Command still running after ${yieldMs}ms (session ${sessionId}). Use process tool to poll/kill.`,
        };
      }

      return {
        exitCode: raceResult.exitCode,
        stdout: raceResult.output.slice(0, 8000),
        status: raceResult.status,
        durationMs: raceResult.durationMs,
        truncated: raceResult.output.length > 8000,
      };
    },
  };
}
