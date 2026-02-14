import type { FastifyInstance } from "fastify";
import type { EventBus } from "@undoable/core";
import type { RunManager } from "../services/run-manager.js";

export function eventRoutes(
  app: FastifyInstance,
  eventBus: EventBus,
  runManager: RunManager,
) {
  app.get<{ Params: { id: string } }>("/runs/:id/events", async (req, reply) => {
    const run = runManager.getById(req.params.id);
    if (!run) return reply.code(404).send({ error: "Run not found" });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const stored = runManager.getEvents(req.params.id);
    for (const event of stored) {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    const unsub = eventBus.onRun(req.params.id, (event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.raw.on("close", () => {
      unsub();
    });
  });
}
