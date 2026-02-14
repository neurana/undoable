import type { FastifyInstance } from "fastify";
import type { InstructionsStore } from "../services/instructions-store.js";

export function instructionsRoutes(app: FastifyInstance, store: InstructionsStore) {
  // Get current instructions for an agent
  app.get<{ Params: { agentId: string } }>("/agents/:agentId/instructions", async (req, reply) => {
    const content = await store.getCurrent(req.params.agentId);
    if (content === null) return reply.code(404).send({ error: "No instructions found" });
    const meta = await store.getMeta(req.params.agentId);
    return { agentId: req.params.agentId, version: meta?.currentVersion ?? 0, content };
  });

  // Save new instructions (creates a new version)
  app.put<{ Params: { agentId: string }; Body: { content: string; summary?: string } }>(
    "/agents/:agentId/instructions",
    async (req, reply) => {
      const { content, summary } = req.body;
      if (content === undefined || content === null) {
        return reply.code(400).send({ error: "content is required" });
      }
      const version = await store.save(req.params.agentId, content, summary);
      return { agentId: req.params.agentId, version };
    },
  );

  // List all versions
  app.get<{ Params: { agentId: string } }>("/agents/:agentId/instructions/versions", async (req) => {
    const versions = await store.listVersions(req.params.agentId);
    const meta = await store.getMeta(req.params.agentId);
    return { agentId: req.params.agentId, currentVersion: meta?.currentVersion ?? 0, versions };
  });

  // Get a specific version
  app.get<{ Params: { agentId: string; version: string } }>(
    "/agents/:agentId/instructions/versions/:version",
    async (req, reply) => {
      const version = parseInt(req.params.version, 10);
      if (isNaN(version)) return reply.code(400).send({ error: "Invalid version number" });
      const content = await store.getVersion(req.params.agentId, version);
      if (content === null) return reply.code(404).send({ error: "Version not found" });
      return { agentId: req.params.agentId, version, content };
    },
  );

  // Revert to a specific version
  app.post<{ Params: { agentId: string; version: string } }>(
    "/agents/:agentId/instructions/versions/:version/revert",
    async (req, reply) => {
      const version = parseInt(req.params.version, 10);
      if (isNaN(version)) return reply.code(400).send({ error: "Invalid version number" });
      const newVersion = await store.revert(req.params.agentId, version);
      if (newVersion === null) return reply.code(404).send({ error: "Version not found" });
      return { agentId: req.params.agentId, version: newVersion, revertedFrom: version };
    },
  );
}
