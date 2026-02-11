import type { FastifyInstance } from "fastify";
import type { EventBus } from "@undoable/core";
import type { AuthUser } from "../auth/types.js";
import type { RunManager } from "../services/run-manager.js";

type AuthRequest = { user: AuthUser };

export function eventRoutes(
  app: FastifyInstance,
  eventBus: EventBus,
  runManager: RunManager,
) {
  app.get<{ Params: { id: string } }>("/runs/:id/events", async (req, reply) => {
    const { user } = req as unknown as AuthRequest;
    const run = runManager.getById(req.params.id);

    if (!run) {
      return reply.code(404).send({ error: "Run not found" });
    }

    if (run.userId !== user.id && user.role !== "admin") {
      return reply.code(403).send({ error: "Forbidden" });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const unsub = eventBus.onRun(req.params.id, (event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.raw.on("close", () => {
      unsub();
    });
  });
}
