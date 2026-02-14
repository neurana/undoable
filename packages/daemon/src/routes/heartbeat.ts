import type { FastifyInstance } from "fastify";
import type { HeartbeatService } from "../services/heartbeat-service.js";

export function heartbeatRoutes(app: FastifyInstance, heartbeatService: HeartbeatService) {
  app.get("/heartbeat/sessions", async () => {
    return {
      sessions: heartbeatService.listSessions(),
      activeCount: heartbeatService.activeCount,
    };
  });

  app.post<{ Body: { sessionId: string } }>("/heartbeat/ping", async (req) => {
    const { sessionId } = req.body;
    if (!sessionId) return { error: "sessionId is required" };
    const health = heartbeatService.ping(sessionId);
    return { sessionId, health, timestamp: Date.now() };
  });

  app.get<{ Params: { id: string } }>("/heartbeat/sessions/:id", async (req, reply) => {
    const health = heartbeatService.getHealth(req.params.id);
    if (health === "dead") {
      return reply.code(404).send({ error: "Session not found or dead" });
    }
    return { sessionId: req.params.id, health };
  });
}
