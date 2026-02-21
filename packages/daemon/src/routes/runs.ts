import type { FastifyInstance } from "fastify";
import type { EventBus } from "@undoable/core";
import type { RunManager } from "../services/run-manager.js";
import type { AuditService } from "../services/audit-service.js";
import type { GatewayIdentity } from "../auth/types.js";
import { executeRun, type RunExecutorDeps } from "../services/run-executor.js";
import type { DaemonOperationalState } from "../services/daemon-settings-service.js";

export type RunRouteDeps = {
  eventBus: EventBus;
  executorDeps?: Omit<RunExecutorDeps, "runManager" | "eventBus">;
  getOperationalState?: () =>
    | DaemonOperationalState
    | Promise<DaemonOperationalState>;
};

export function runRoutes(
  app: FastifyInstance,
  runManager: RunManager,
  auditService: AuditService,
  extra?: RunRouteDeps,
) {
  const activeRuns = new Map<string, boolean>();
  const getOperationalState = extra?.getOperationalState;

  const startExecution = (runId: string, instruction: string) => {
    if (!extra?.executorDeps || !extra.eventBus) return;
    activeRuns.set(runId, true);
    const deps: RunExecutorDeps = {
      ...extra.executorDeps,
      runManager,
      eventBus: extra.eventBus,
    };
    // Fire and forget — events stream via SSE
    executeRun(runId, instruction, deps).finally(() => {
      activeRuns.delete(runId);
    });
  };

  app.post<{ Body: { instruction: string; agentId?: string } }>("/runs", async (req, reply) => {
    const identity = (req as unknown as { identity: GatewayIdentity }).identity;
    const { instruction, agentId } = req.body;

    if (!instruction) {
      return reply.code(400).send({ error: "instruction is required" });
    }

    if (getOperationalState) {
      const operation = await getOperationalState();
      if (operation.mode !== "normal") {
        const modeLabel = operation.mode === "drain" ? "drain" : "paused";
        return reply.code(423).send({
          error: `Daemon is in ${modeLabel} mode; new runs are blocked.`,
          code: "DAEMON_OPERATION_MODE_BLOCK",
          operation,
          recovery:
            "Set operation mode back to normal via /control/operation or `nrn daemon mode normal`.",
        });
      }
    }

    const run = runManager.create({
      userId: identity.id,
      agentId: agentId ?? "default",
      instruction,
    });

    auditService.log({
      userId: identity.id,
      action: "run.create",
      resourceType: "run",
      resourceId: run.id,
    });

    // Auto-start execution
    startExecution(run.id, instruction);

    return reply.code(201).send(run);
  });

  app.get<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    const run = runManager.getById(req.params.id);
    if (!run) return reply.code(404).send({ error: "Run not found" });
    return run;
  });

  app.get<{ Querystring: { jobId?: string } }>("/runs", async (req) => {
    if (req.query.jobId) return runManager.listByJobId(req.query.jobId);
    return runManager.list();
  });

  app.post<{ Params: { id: string; action: string } }>("/runs/:id/:action", async (req, reply) => {
    const identity = (req as unknown as { identity: GatewayIdentity }).identity;
    const run = runManager.getById(req.params.id);
    if (!run) return reply.code(404).send({ error: "Run not found" });

    const action = req.params.action;
    const validActions = ["pause", "resume", "cancel", "apply", "undo"];
    if (!validActions.includes(action)) return reply.code(400).send({ error: `Invalid action: ${action}` });

    const statusMap: Record<string, string> = {
      pause: "paused",
      resume: run.status === "paused" ? "planning" : run.status,
      cancel: "cancelled",
      apply: "applying",
      undo: "undoing",
    };

    const newStatus = statusMap[action]!;
    const updated = runManager.updateStatus(run.id, newStatus as typeof run.status, identity.id);

    auditService.log({
      userId: identity.id,
      action: `run.${action}`,
      resourceType: "run",
      resourceId: run.id,
    });

    return updated;
  });

  app.delete<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    const identity = (req as unknown as { identity: GatewayIdentity }).identity;
    const deleted = runManager.delete(req.params.id);
    if (!deleted) return reply.code(404).send({ error: "Run not found" });

    auditService.log({
      userId: identity.id,
      action: "run.delete",
      resourceType: "run",
      resourceId: req.params.id,
    });

    return { deleted: true };
  });
}
