import type { FastifyInstance } from "fastify";
import type { RunManager } from "../services/run-manager.js";
import type { AuditService } from "../services/audit-service.js";
import type { AuthUser } from "../auth/types.js";

type AuthRequest = { user: AuthUser };

export function runRoutes(
  app: FastifyInstance,
  runManager: RunManager,
  auditService: AuditService,
) {
  app.post<{ Body: { instruction: string; agentId?: string } }>("/runs", async (req, reply) => {
    const { user } = req as unknown as AuthRequest;
    const { instruction, agentId } = req.body;

    if (!instruction) {
      return reply.code(400).send({ error: "instruction is required" });
    }

    const run = runManager.create({
      userId: user.id,
      agentId: agentId ?? "default",
      instruction,
    });

    auditService.log({
      userId: user.id,
      action: "run.create",
      resourceType: "run",
      resourceId: run.id,
    });

    return reply.code(201).send(run);
  });

  app.get<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    const { user } = req as unknown as AuthRequest;
    const run = runManager.getById(req.params.id);

    if (!run) {
      return reply.code(404).send({ error: "Run not found" });
    }

    if (run.userId !== user.id && (req as unknown as AuthRequest).user.role === "viewer") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    return run;
  });

  app.get("/runs", async (req) => {
    const { user } = req as unknown as AuthRequest;
    if (user.role === "admin") {
      return runManager.list();
    }
    return runManager.list(user.id);
  });

  app.post<{ Params: { id: string; action: string } }>("/runs/:id/:action", async (req, reply) => {
    const { user } = req as unknown as AuthRequest;
    const run = runManager.getById(req.params.id);

    if (!run) {
      return reply.code(404).send({ error: "Run not found" });
    }

    const action = req.params.action;
    const validActions = ["pause", "resume", "cancel", "apply", "undo"];
    if (!validActions.includes(action)) {
      return reply.code(400).send({ error: `Invalid action: ${action}` });
    }

    const statusMap: Record<string, string> = {
      pause: "paused",
      resume: run.status === "paused" ? "planning" : run.status,
      cancel: "cancelled",
      apply: "applying",
      undo: "undoing",
    };

    const newStatus = statusMap[action]!;
    const updated = runManager.updateStatus(run.id, newStatus as typeof run.status, user.id);

    auditService.log({
      userId: user.id,
      action: `run.${action}`,
      resourceType: "run",
      resourceId: run.id,
    });

    return updated;
  });

  app.delete<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    const { user } = req as unknown as AuthRequest;

    if (user.role !== "admin") {
      return reply.code(403).send({ error: "Forbidden: admin only" });
    }

    const deleted = runManager.delete(req.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: "Run not found" });
    }

    auditService.log({
      userId: user.id,
      action: "run.delete",
      resourceType: "run",
      resourceId: req.params.id,
    });

    return { deleted: true };
  });
}
