import type { AgentTool } from "./types.js";
import {
  getSession,
  getFinishedSession,
  listRunningSessions,
  listFinishedSessions,
  deleteSession,
  killSession,
  waitForExit,
} from "./exec-registry.js";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function createProcessTool(): AgentTool {
  return {
    name: "process",
    definition: {
      type: "function",
      function: {
        name: "process",
        description:
          "Manage running exec sessions. Actions: list (all sessions), poll (check status/output — use waitMs to block until done instead of polling repeatedly), log (full output), kill (terminate), remove (delete finished). IMPORTANT: For long-running commands, use poll with waitMs (e.g. 30000) to wait up to that many ms for completion instead of calling poll repeatedly.",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["list", "poll", "log", "kill", "remove"],
              description: "Process action",
            },
            sessionId: {
              type: "string",
              description: "Session ID (required for poll/log/kill/remove)",
            },
            waitMs: {
              type: "number",
              description: "For poll: block up to this many ms for the process to finish (max 120000). Avoids repeated polling.",
            },
          },
          required: ["action"],
        },
      },
    },
    execute: async (args) => {
      const action = args.action as string;

      if (action === "list") {
        const running = listRunningSessions().map((s) => ({
          sessionId: s.id,
          status: "running",
          pid: s.pid,
          command: s.command.slice(0, 120),
          runtime: formatDuration(Date.now() - s.startedAt),
          cwd: s.cwd,
          tail: s.tail.slice(-500),
        }));
        const finished = listFinishedSessions().map((s) => ({
          sessionId: s.id,
          status: s.status,
          command: s.command.slice(0, 120),
          runtime: formatDuration(s.endedAt - s.startedAt),
          exitCode: s.exitCode,
          cwd: s.cwd,
          tail: s.tail.slice(-500),
        }));
        const all = [...running, ...finished].sort(
          (a, b) => ("pid" in b ? 1 : 0) - ("pid" in a ? 1 : 0),
        );
        return { sessions: all, total: all.length };
      }

      const sessionId = args.sessionId as string;
      if (!sessionId) return { error: "sessionId is required for this action" };

      const running = getSession(sessionId);
      const finished = getFinishedSession(sessionId);

      if (!running && !finished) {
        return { error: `Session ${sessionId} not found` };
      }

      switch (action) {
        case "poll": {
          const waitMs = Math.min(Math.max(0, Number(args.waitMs) || 0), 120_000);

          if (running && waitMs > 0) {
            const waited = await waitForExit(sessionId, waitMs);
            if (waited) {
              const done = getFinishedSession(sessionId);
              if (done) {
                return {
                  sessionId: done.id,
                  status: done.status,
                  exitCode: done.exitCode,
                  command: done.command,
                  runtime: formatDuration(done.endedAt - done.startedAt),
                  tail: done.tail.slice(-2000),
                  truncated: done.truncated,
                };
              }
            }
            const still = getSession(sessionId);
            if (still) {
              return {
                sessionId: still.id,
                status: "running",
                pid: still.pid,
                command: still.command,
                runtime: formatDuration(Date.now() - still.startedAt),
                tail: still.tail.slice(-2000),
                truncated: still.truncated,
                waited: true,
                waitedMs: waitMs,
              };
            }
          }

          if (running) {
            return {
              sessionId: running.id,
              status: "running",
              pid: running.pid,
              command: running.command,
              runtime: formatDuration(Date.now() - running.startedAt),
              tail: running.tail.slice(-2000),
              truncated: running.truncated,
            };
          }
          return {
            sessionId: finished!.id,
            status: finished!.status,
            exitCode: finished!.exitCode,
            command: finished!.command,
            runtime: formatDuration(finished!.endedAt - finished!.startedAt),
            tail: finished!.tail.slice(-2000),
            truncated: finished!.truncated,
          };
        }

        case "log": {
          const session = running || finished;
          return {
            sessionId: session!.id,
            status: running ? "running" : finished!.status,
            output: session!.aggregated.slice(-8000),
            truncated: session!.truncated || session!.aggregated.length > 8000,
          };
        }

        case "kill": {
          if (!running) return { error: `Session ${sessionId} is not running` };
          killSession(running);
          return { sessionId, killed: true };
        }

        case "remove": {
          deleteSession(sessionId);
          return { sessionId, removed: true };
        }

        default:
          return { error: `Unknown action: ${action}` };
      }
    },
  };
}
