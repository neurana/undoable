import type { FastifyInstance } from "fastify";
import type { AgentRegistry } from "@undoable/core";

export function agentRoutes(app: FastifyInstance, agentRegistry: AgentRegistry) {
  app.get("/agents", async () => {
    return agentRegistry.list().map((a) => ({
      id: a.id,
      model: a.model,
      default: a.default ?? false,
    }));
  });

  app.get<{ Params: { id: string } }>("/agents/:id", async (req, reply) => {
    const agent = agentRegistry.get(req.params.id);
    if (!agent) {
      return reply.code(404).send({ error: "Agent not found" });
    }
    return agent;
  });
}
