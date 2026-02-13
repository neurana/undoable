import type { AgentTool } from "./types.js";
import type { RunManager } from "../services/run-manager.js";
import type { SchedulerService } from "@undoable/core";

export function createWorkflowTools(
  runManager: RunManager,
  scheduler: SchedulerService,
): AgentTool[] {
  return [
    {
      name: "list_runs",
      definition: {
        type: "function",
        function: {
          name: "list_runs",
          description: "List all runs in the system.",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      execute: async () => runManager.list(),
    },
    {
      name: "create_run",
      definition: {
        type: "function",
        function: {
          name: "create_run",
          description: "Create a new run. A run is an AI agent execution that carries out an instruction.",
          parameters: {
            type: "object",
            properties: {
              instruction: { type: "string", description: "What the AI agent should do" },
              agentId: { type: "string", description: "Agent ID (default: 'default')" },
            },
            required: ["instruction"],
          },
        },
      },
      execute: async (args) =>
        runManager.create({
          userId: "chat",
          agentId: (args.agentId as string) ?? "default",
          instruction: args.instruction as string,
        }),
    },
    {
      name: "list_jobs",
      definition: {
        type: "function",
        function: {
          name: "list_jobs",
          description: "List all scheduled jobs.",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      execute: async () => scheduler.list({ includeDisabled: true }),
    },
    {
      name: "create_job",
      definition: {
        type: "function",
        function: {
          name: "create_job",
          description: "Create a scheduled job. Schedule kinds: 'every' (interval), 'at' (one-shot), 'cron'.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Job name" },
              instruction: { type: "string", description: "What to do when fired" },
              scheduleKind: { type: "string", enum: ["every", "at", "cron"], description: "Schedule type" },
              everySeconds: { type: "number", description: "Interval in seconds (for 'every')" },
              atISO: { type: "string", description: "ISO datetime (for 'at')" },
              cronExpr: { type: "string", description: "Cron expression (for 'cron')" },
              enabled: { type: "boolean", description: "Start enabled (default: true)" },
            },
            required: ["name", "instruction", "scheduleKind"],
          },
        },
      },
      execute: async (args) => {
        const kind = args.scheduleKind as string;
        const schedule =
          kind === "every"
            ? { kind: "every" as const, everyMs: ((args.everySeconds as number) ?? 60) * 1000 }
            : kind === "at"
              ? { kind: "at" as const, at: args.atISO as string }
              : { kind: "cron" as const, expr: args.cronExpr as string };
        return scheduler.add({
          name: args.name as string,
          enabled: (args.enabled as boolean) ?? true,
          schedule,
          payload: { kind: "run", instruction: args.instruction as string },
        });
      },
    },
    {
      name: "delete_job",
      definition: {
        type: "function",
        function: {
          name: "delete_job",
          description: "Delete a scheduled job.",
          parameters: {
            type: "object",
            properties: { jobId: { type: "string", description: "Job ID" } },
            required: ["jobId"],
          },
        },
      },
      execute: async (args) => ({ deleted: await scheduler.remove(args.jobId as string) }),
    },
    {
      name: "toggle_job",
      definition: {
        type: "function",
        function: {
          name: "toggle_job",
          description: "Enable or disable a scheduled job.",
          parameters: {
            type: "object",
            properties: {
              jobId: { type: "string", description: "Job ID" },
              enabled: { type: "boolean", description: "True to enable, false to disable" },
            },
            required: ["jobId", "enabled"],
          },
        },
      },
      execute: async (args) => scheduler.update(args.jobId as string, { enabled: args.enabled as boolean }),
    },
    {
      name: "run_job",
      definition: {
        type: "function",
        function: {
          name: "run_job",
          description: "Manually trigger a job immediately.",
          parameters: {
            type: "object",
            properties: { jobId: { type: "string", description: "Job ID" } },
            required: ["jobId"],
          },
        },
      },
      execute: async (args) => ({ ran: await scheduler.run(args.jobId as string, "force") }),
    },
    {
      name: "scheduler_status",
      definition: {
        type: "function",
        function: {
          name: "scheduler_status",
          description: "Get scheduler status.",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      execute: async () => scheduler.status(),
    },
  ];
}
