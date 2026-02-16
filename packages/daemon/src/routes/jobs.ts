import type { FastifyInstance } from "fastify";
import type { SchedulerService } from "@undoable/core";
import type { JobCreate, JobPatch } from "@undoable/core";
import { JobsUndoRedoService } from "../services/jobs-undo-redo-service.js";

export function jobRoutes(
  app: FastifyInstance,
  scheduler: SchedulerService,
  jobsUndoRedo = new JobsUndoRedoService(),
) {
  app.get("/jobs", async () => {
    return scheduler.list({ includeDisabled: true });
  });

  app.post<{ Body: JobCreate }>("/jobs", async (req, reply) => {
    const { name, description, enabled, schedule, payload, deleteAfterRun } = req.body;
    if (!name || !schedule || !payload) {
      return reply.code(400).send({ error: "name, schedule, and payload are required" });
    }
    const job = await scheduler.add({ name, description, enabled: enabled ?? true, schedule, payload, deleteAfterRun });
    jobsUndoRedo.recordCreate(job);
    return reply.code(201).send(job);
  });

  app.patch<{ Params: { id: string }; Body: JobPatch }>("/jobs/:id", async (req, reply) => {
    try {
      const existing = (await scheduler.list({ includeDisabled: true })).find((job) => job.id === req.params.id);
      if (!existing) {
        return reply.code(404).send({ error: "Job not found" });
      }
      const updated = await scheduler.update(req.params.id, req.body);
      jobsUndoRedo.recordUpdate(existing, updated);
      return updated;
    } catch {
      return reply.code(404).send({ error: "Job not found" });
    }
  });

  app.delete<{ Params: { id: string } }>("/jobs/:id", async (req, reply) => {
    const existing = (await scheduler.list({ includeDisabled: true })).find((job) => job.id === req.params.id);
    if (!existing) return reply.code(404).send({ error: "Job not found" });
    const removed = await scheduler.remove(req.params.id);
    if (!removed) return reply.code(404).send({ error: "Job not found" });
    jobsUndoRedo.recordDelete(existing);
    return { deleted: true };
  });

  app.post<{ Params: { id: string }; Querystring: { force?: string } }>("/jobs/:id/run", async (req, reply) => {
    try {
      const force = req.query.force === "true" || req.query.force === "1";
      const ran = await scheduler.run(req.params.id, force ? "force" : "due");
      return { ran };
    } catch {
      return reply.code(404).send({ error: "Job not found" });
    }
  });

  app.get("/jobs/status", async () => {
    return scheduler.status();
  });

  app.get("/jobs/history/status", async () => {
    return jobsUndoRedo.status();
  });

  app.post("/jobs/history/undo", async (_req, reply) => {
    const result = await jobsUndoRedo.undoLast(scheduler);
    if (!result.ok) return reply.code(400).send({ error: result.error ?? "Undo failed" });
    return { ok: true, result, status: jobsUndoRedo.status() };
  });

  app.post("/jobs/history/redo", async (_req, reply) => {
    const result = await jobsUndoRedo.redoLast(scheduler);
    if (!result.ok) return reply.code(400).send({ error: result.error ?? "Redo failed" });
    return { ok: true, result, status: jobsUndoRedo.status() };
  });
}
