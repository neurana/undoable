import type { FastifyInstance } from "fastify";
import type { SkillsService } from "../services/skills-service.js";

export function skillsRoutes(app: FastifyInstance, skillsService: SkillsService) {
  app.get("/skills", async () => {
    const skills = skillsService.list();
    return {
      total: skills.length,
      eligible: skillsService.eligibleCount(),
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

  app.post("/skills/refresh", async () => {
    const skills = skillsService.refresh();
    return {
      total: skills.length,
      eligible: skillsService.eligibleCount(),
    };
  });
}
