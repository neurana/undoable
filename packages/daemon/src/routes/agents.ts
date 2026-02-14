import type { FastifyInstance } from "fastify";
import type { AgentRegistry } from "@undoable/core";
import type { AgentConfig } from "@undoable/shared";
import type { InstructionsStore } from "../services/instructions-store.js";

export function agentRoutes(app: FastifyInstance, agentRegistry: AgentRegistry, instructionsStore: InstructionsStore) {
  app.get("/agents", async () => {
    const agents = agentRegistry.list();
    const results = await Promise.all(agents.map(async (a) => {
      const instructions = await instructionsStore.getCurrent(a.id);
      return {
        id: a.id,
        name: a.name ?? a.id,
        model: a.model,
        instructions: instructions ?? undefined,
        skills: a.skills,
        sandbox: a.sandbox,
        default: a.default ?? false,
      };
    }));
    return results;
  });

  app.get<{ Params: { id: string } }>("/agents/:id", async (req, reply) => {
    const agent = agentRegistry.get(req.params.id);
    if (!agent) {
      return reply.code(404).send({ error: "Agent not found" });
    }
    const instructions = await instructionsStore.getCurrent(req.params.id);
    return { ...agent, instructions: instructions ?? undefined };
  });

  app.post<{ Body: { id: string; name?: string; model: string; instructions?: string; skills?: string[]; sandbox?: Partial<AgentConfig["sandbox"]>; default?: boolean } }>("/agents", async (req, reply) => {
    const { id, name, model, instructions, skills, sandbox, default: isDefault } = req.body;

    if (!id || !model) {
      return reply.code(400).send({ error: "id and model are required" });
    }

    if (agentRegistry.get(id)) {
      return reply.code(409).send({ error: `Agent "${id}" already exists` });
    }

    const config: AgentConfig = {
      id,
      name: name ?? id,
      model,
      skills: skills ?? [],
      sandbox: { docker: false, network: false, browser: false, ...sandbox },
      default: isDefault ?? false,
    };

    agentRegistry.register(config);
    if (instructions) {
      await instructionsStore.save(id, instructions, "Initial version");
    }
    return reply.code(201).send({ ...config, instructions: instructions ?? undefined });
  });

  app.put<{ Params: { id: string }; Body: { name?: string; model?: string; instructions?: string; skills?: string[]; sandbox?: Partial<AgentConfig["sandbox"]>; default?: boolean } }>("/agents/:id", async (req, reply) => {
    const { id } = req.params;
    const { sandbox: sandboxPatch, instructions, ...rest } = req.body;

    const existing = agentRegistry.get(id);
    if (!existing) {
      return reply.code(404).send({ error: "Agent not found" });
    }

    const patch: Partial<Omit<AgentConfig, "id">> = { ...rest };
    if (sandboxPatch) {
      patch.sandbox = { ...existing.sandbox, ...sandboxPatch };
    }

    const updated = agentRegistry.update(id, patch);
    if (instructions !== undefined) {
      await instructionsStore.save(id, instructions);
    }
    const currentInstructions = await instructionsStore.getCurrent(id);
    return { ...updated, instructions: currentInstructions ?? undefined };
  });

  app.delete<{ Params: { id: string } }>("/agents/:id", async (req, reply) => {
    const deleted = agentRegistry.remove(req.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: "Agent not found" });
    }
    await instructionsStore.deleteAll(req.params.id);
    return { deleted: true };
  });
}
