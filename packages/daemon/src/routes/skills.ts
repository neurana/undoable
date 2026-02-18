import type { FastifyInstance } from "fastify";
import type { SkillsService } from "../services/skills-service.js";

export function skillsRoutes(app: FastifyInstance, skillsService: SkillsService) {
  app.get("/skills", async () => {
    const skills = skillsService.list();
    return {
      total: skills.length,
      eligible: skillsService.eligibleCount(),
      warning: skillsService.getDangerWarning(),
      supportedAgents: skillsService.getSupportedAgents(),
      skills: skills.map((s) => ({
        name: s.name,
        description: s.description,
        emoji: s.emoji ?? null,
        homepage: s.homepage ?? null,
        source: s.source,
        filePath: s.filePath,
        eligible: s.eligible,
        disabled: s.disabled,
        missing: s.missing,
        requires: s.requires ?? null,
      })),
    };
  });

  app.post<{ Body: { name: string; enabled: boolean } }>("/skills/toggle", async (req, reply) => {
    const { name, enabled } = req.body;
    if (!name) return reply.code(400).send({ error: "name is required" });
    const skill = skillsService.getByName(name);
    if (!skill) return reply.code(404).send({ error: `skill "${name}" not found` });
    skillsService.toggle(name, enabled);
    return { ok: true, name, enabled };
  });

  app.post<{ Body: { query?: string } }>("/skills/search", async (req) => {
    const query = typeof req.body?.query === "string" ? req.body.query : undefined;
    return skillsService.searchRegistry(query);
  });

  app.post<{ Body: { reference: string; global?: boolean; agents?: string[] } }>("/skills/preflight", async (req, reply) => {
    const reference = req.body?.reference;
    if (typeof reference !== "string" || !reference.trim()) {
      return reply.code(400).send({ error: "reference is required" });
    }
    const agents = Array.isArray(req.body?.agents)
      ? req.body.agents
        .map((agent) => String(agent).trim())
        .filter(Boolean)
      : undefined;
    const result = await skillsService.preflightInstallFromRegistry(reference.trim(), {
      global: req.body?.global !== false,
      agents,
    });
    if (!result.ok) {
      return reply.code(400).send(result);
    }
    return result;
  });

  app.post<{ Body: { page?: number; limit?: number } }>("/skills/discover", async (req) => {
    const page = typeof req.body?.page === "number"
      ? Math.max(0, Math.floor(req.body.page))
      : 0;
    const limit = typeof req.body?.limit === "number"
      ? Math.max(1, Math.min(Math.floor(req.body.limit), 50))
      : 10;
    return skillsService.discoverSkills(page, limit);
  });

  app.post<{ Body: { reference: string; global?: boolean; agents?: string[] } }>("/skills/install", async (req, reply) => {
    const reference = req.body?.reference;
    if (typeof reference !== "string" || !reference.trim()) {
      return reply.code(400).send({ error: "reference is required" });
    }
    const agents = Array.isArray(req.body?.agents)
      ? req.body.agents
        .map((agent) => String(agent).trim())
        .filter(Boolean)
      : undefined;
    const result = await skillsService.installFromRegistry(reference.trim(), {
      global: req.body?.global !== false,
      agents,
    });
    if (!result.ok) {
      if (result.preflight && !result.preflight.ok) {
        return reply.code(400).send(result);
      }
      if (
        result.message.includes("invalid reference format") ||
        result.message.includes("select at least one agent target")
      ) {
        return reply.code(400).send(result);
      }
      return reply.code(502).send(result);
    }
    return result;
  });

  app.post<{ Body: { global?: boolean; agents?: string[] } }>("/skills/list", async (req) => {
    return skillsService.listInstalled({
      global: req.body?.global === true,
      agents: Array.isArray(req.body?.agents) ? req.body.agents : undefined,
    });
  });

  app.post("/skills/check", async () => {
    return skillsService.checkForUpdates();
  });

  app.post("/skills/update", async () => {
    return skillsService.updateInstalled();
  });

  app.post<{ Body: { skills?: string[]; all?: boolean; global?: boolean; agents?: string[] } }>("/skills/remove", async (req, reply) => {
    const result = await skillsService.removeInstalled({
      skills: Array.isArray(req.body?.skills) ? req.body.skills : [],
      all: req.body?.all === true,
      global: req.body?.global === true,
      agents: Array.isArray(req.body?.agents) ? req.body.agents : undefined,
    });
    if (!result.ok) {
      return reply.code(400).send(result);
    }
    return result;
  });

  app.post("/skills/refresh", async () => {
    const skills = skillsService.refresh();
    return {
      total: skills.length,
      eligible: skillsService.eligibleCount(),
    };
  });
}
