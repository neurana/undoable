import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { SkillsService } from "../services/skills-service.js";
import { skillsRoutes } from "./skills.js";

describe("skills routes", () => {
  const app = Fastify();
  let lastInstallAgents: string[] | undefined;
  let lastPreflightAgents: string[] | undefined;

  const warning = {
    title: "Third-party skills can be dangerous",
    message: "review before use",
    docs: ["https://skills.sh/docs"],
  };

  const skillsService = {
    list: () => [{
      name: "find-skills",
      description: "help discover skills",
      emoji: "🔎",
      homepage: "https://skills.sh/vercel-labs/skills/find-skills",
      source: "user",
      filePath: "/tmp/find-skills/SKILL.md",
      baseDir: "/tmp/find-skills",
      body: "",
      eligible: true,
      disabled: false,
      missing: { bins: [], env: [] },
      requires: { bins: ["npx"] },
    }],
    eligibleCount: () => 1,
    getDangerWarning: () => warning,
    getSupportedAgents: () => ["codex", "cursor"],
    getByName: (name: string) => (name === "find-skills" ? { name } : undefined),
    toggle: () => true,
    searchRegistry: async (query?: string) => ({
      ok: true,
      query: query ?? "",
      warning,
      results: [{
        reference: "vercel-labs/skills@find-skills",
        repo: "vercel-labs/skills",
        skill: "find-skills",
        url: "https://skills.sh/vercel-labs/skills/find-skills",
        installCommand: "npx skills add vercel-labs/skills --skill find-skills -g --agent codex -y",
        recommended: true,
      }],
    }),
    preflightInstallFromRegistry: async (_reference: string, opts?: { agents?: string[] }) => {
      lastPreflightAgents = opts?.agents;
      if (!Array.isArray(opts?.agents) || opts.agents.length === 0) {
        return {
          ok: false,
          reference: "vercel-labs/skills@find-skills",
          global: true,
          agents: [],
          checks: [
            {
              id: "agents",
              label: "Target agents",
              status: "fail",
              message: "select at least one agent target",
            },
          ],
          errors: ["select at least one agent target"],
          warning,
        };
      }
      return {
        ok: true,
        reference: "vercel-labs/skills@find-skills",
        normalizedReference: "vercel-labs/skills@find-skills",
        global: true,
        agents: opts.agents,
        checks: [
          {
            id: "agents",
            label: "Target agents",
            status: "pass",
            message: "ready",
          },
        ],
        errors: [],
        warning,
      };
    },
    installFromRegistry: async (_reference: string, opts?: { agents?: string[] }) => {
      lastInstallAgents = opts?.agents;
      if (!Array.isArray(opts?.agents) || opts.agents.length === 0) {
        return {
          ok: false,
          installed: false,
          reference: "vercel-labs/skills@find-skills",
          message: "select at least one agent target (claude-code, codex, cursor, windsurf, opencode)",
          warning,
        };
      }
      return {
        ok: true,
        installed: true,
        reference: "vercel-labs/skills@find-skills",
        message: "installed",
        warning,
      };
    },
    listInstalled: async () => ({
      ok: true,
      command: "npx -y skills list",
      message: "listed",
      warning,
      entries: ["vercel-labs/skills@find-skills"],
    }),
    checkForUpdates: async () => ({
      ok: true,
      command: "npx -y skills check",
      message: "checked",
      warning,
    }),
    updateInstalled: async () => ({
      ok: true,
      command: "npx -y skills update",
      message: "updated",
      warning,
    }),
    removeInstalled: async () => ({
      ok: true,
      command: "npx -y skills remove",
      message: "removed",
      warning,
    }),
    refresh: () => [{
      name: "find-skills",
      description: "help discover skills",
      emoji: "🔎",
      homepage: "https://skills.sh/vercel-labs/skills/find-skills",
      source: "user",
      filePath: "/tmp/find-skills/SKILL.md",
      baseDir: "/tmp/find-skills",
      body: "",
      eligible: true,
      disabled: false,
      missing: { bins: [], env: [] },
      requires: { bins: ["npx"] },
    }],
  } as unknown as SkillsService;

  beforeAll(async () => {
    skillsRoutes(app, skillsService);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns warning and supported agents on GET /skills", async () => {
    const response = await app.inject({ method: "GET", url: "/skills" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.warning.title).toContain("dangerous");
    expect(body.supportedAgents).toContain("codex");
  });

  it("supports registry search/install and cli list/check/update/remove", async () => {
    const search = await app.inject({ method: "POST", url: "/skills/search", payload: { query: "testing" } });
    expect(search.statusCode).toBe(200);
    expect(search.json().ok).toBe(true);

    const preflightFail = await app.inject({ method: "POST", url: "/skills/preflight", payload: { reference: "vercel-labs/skills@find-skills" } });
    expect(preflightFail.statusCode).toBe(400);

    const preflightOk = await app.inject({
      method: "POST",
      url: "/skills/preflight",
      payload: { reference: "vercel-labs/skills@find-skills", agents: [" codex ", ""] },
    });
    expect(preflightOk.statusCode).toBe(200);
    expect(lastPreflightAgents).toEqual(["codex"]);

    const installFail = await app.inject({ method: "POST", url: "/skills/install", payload: { reference: "vercel-labs/skills@find-skills" } });
    expect(installFail.statusCode).toBe(400);

    const installOk = await app.inject({
      method: "POST",
      url: "/skills/install",
      payload: { reference: "vercel-labs/skills@find-skills", agents: [" codex ", ""] },
    });
    expect(installOk.statusCode).toBe(200);
    expect(lastInstallAgents).toEqual(["codex"]);

    const list = await app.inject({ method: "POST", url: "/skills/list", payload: {} });
    expect(list.statusCode).toBe(200);
    expect(list.json().entries).toContain("vercel-labs/skills@find-skills");

    const check = await app.inject({ method: "POST", url: "/skills/check", payload: {} });
    expect(check.statusCode).toBe(200);
    expect(check.json().ok).toBe(true);

    const update = await app.inject({ method: "POST", url: "/skills/update", payload: {} });
    expect(update.statusCode).toBe(200);
    expect(update.json().ok).toBe(true);

    const remove = await app.inject({ method: "POST", url: "/skills/remove", payload: { all: true } });
    expect(remove.statusCode).toBe(200);
    expect(remove.json().ok).toBe(true);
  });
});
