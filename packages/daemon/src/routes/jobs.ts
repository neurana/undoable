import type { FastifyInstance } from "fastify";
import type { SchedulerService } from "@undoable/core";
import type { JobCreate, JobPatch } from "@undoable/core";

export function jobRoutes(app: FastifyInstance, scheduler: SchedulerService) {
  app.get("/jobs", async () => {
    return scheduler.list({ includeDisabled: true });
  });

  app.post<{ Body: JobCreate }>("/jobs", async (req, reply) => {
    const { name, enabled, schedule, payload } = req.body;
    if (!name || !schedule || !payload) {
      return reply.code(400).send({ error: "name, schedule, and payload are required" });
    }
    const job = await scheduler.add({ name, enabled: enabled ?? true, schedule, payload });
    return reply.code(201).send(job);
  });

  app.patch<{ Params: { id: string }; Body: JobPatch }>("/jobs/:id", async (req, reply) => {
    try {
      const updated = await scheduler.update(req.params.id, req.body);
      return updated;
    } catch {
      return reply.code(404).send({ error: "Job not found" });
    }
  });

  app.delete<{ Params: { id: string } }>("/jobs/:id", async (req, reply) => {
    const removed = await scheduler.remove(req.params.id);
    if (!removed) return reply.code(404).send({ error: "Job not found" });
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
}
