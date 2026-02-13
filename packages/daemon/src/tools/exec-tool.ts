import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import type { AgentTool } from "./types.js";
import { validateEnv, isDestructiveCommand } from "./exec-security.js";
import { type ExecAllowlistConfig, loadAllowlistConfig, evaluateCommand } from "./exec-allowlist.js";
import {
  addSession,
  appendOutput,
  createSessionId,
  markExited,
  markBackgrounded,
  MAX_OUTPUT_CHARS,
} from "./exec-registry.js";

const DEFAULT_TIMEOUT_SEC = 120;
const DEFAULT_YIELD_MS = 10_000;
const HOME = os.homedir();
const SHELL_CANDIDATES = ["/bin/zsh", "/bin/bash", "/bin/sh"];

function getShell(): { shell: string; args: string[] } {
  if (process.platform === "win32") return { shell: "cmd.exe", args: ["/c"] };
  const preferred = process.env.SHELL;
  if (preferred && existsSync(preferred)) return { shell: preferred, args: ["-c"] };
  for (const candidate of SHELL_CANDIDATES) {
    if (existsSync(candidate)) return { shell: candidate, args: ["-c"] };
  }
  return { shell: "/bin/sh", args: ["-c"] };
}

export function createExecTool(opts?: { allowlistConfig?: ExecAllowlistConfig }): AgentTool {
  const allowlistConfig = opts?.allowlistConfig ?? loadAllowlistConfig();
  return {
    name: "exec",
    definition: {
      type: "function",
      function: {
        name: "exec",
        description:
          "Execute a shell command. Supports background execution for long-running commands. Returns stdout/stderr and exit code. Use for installing packages, running scripts, git, system tasks.",
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
          },
          required: ["command"],
        },
      },
    },
    execute: async (args) => {
      const command = args.command as string;
      if (!command?.trim()) throw new Error("command is required");

      const cwd = (args.cwd as string) || HOME;
      const timeoutSec = (args.timeout as number) || DEFAULT_TIMEOUT_SEC;
      const backgroundRequested = args.background === true;
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
