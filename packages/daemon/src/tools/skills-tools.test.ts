import { describe, expect, it, vi } from "vitest";
import type { SkillsService } from "../services/skills-service.js";
import { createSkillsTools } from "./skills-tools.js";

const warning = {
  title: "Third-party skills can be dangerous",
  message: "review before use",
  docs: ["https://skills.sh/docs"],
};

const sampleSkill = {
  name: "find-skills",
  description: "discover skills",
  emoji: "🔎",
  homepage: "https://skills.sh/vercel-labs/skills/find-skills",
  source: "global",
  filePath: "/tmp/find-skills/SKILL.md",
  baseDir: "/tmp/find-skills",
  body: "",
  eligible: true,
  disabled: false,
  missing: { bins: [], env: [] },
  requires: { bins: ["npx"] },
};

type MockSkillsService = SkillsService & {
  list: ReturnType<typeof vi.fn>;
  eligibleCount: ReturnType<typeof vi.fn>;
  getDangerWarning: ReturnType<typeof vi.fn>;
  getSupportedAgents: ReturnType<typeof vi.fn>;
  searchRegistry: ReturnType<typeof vi.fn>;
  discoverSkills: ReturnType<typeof vi.fn>;
  installFromRegistry: ReturnType<typeof vi.fn>;
  listInstalled: ReturnType<typeof vi.fn>;
  checkForUpdates: ReturnType<typeof vi.fn>;
  updateInstalled: ReturnType<typeof vi.fn>;
  removeInstalled: ReturnType<typeof vi.fn>;
  getByName: ReturnType<typeof vi.fn>;
  toggle: ReturnType<typeof vi.fn>;
};

function buildServiceMock(): MockSkillsService {
  const service = {
    list: vi.fn(() => [sampleSkill]),
    eligibleCount: vi.fn(() => 1),
    getDangerWarning: vi.fn(() => warning),
    getSupportedAgents: vi.fn(() => ["codex", "cursor"]),
    searchRegistry: vi.fn(async (query?: string) => ({ ok: true, query: query ?? "", warning, results: [] })),
    discoverSkills: vi.fn(async (page: number, limit: number) => ({ ok: true, warning, results: [], hasMore: false, page, limit })),
    installFromRegistry: vi.fn(async (reference: string, opts?: { global?: boolean; agents?: string[] }) => ({
      ok: true,
      installed: true,
      reference,
      message: "installed",
      warning,
      opts,
    })),
    listInstalled: vi.fn(async () => ({
      ok: true,
      command: "npx -y skills list",
      message: "listed",
      warning,
      entries: ["vercel-labs/skills@find-skills"],
    })),
    checkForUpdates: vi.fn(async () => ({
      ok: true,
      command: "npx -y skills check",
      message: "checked",
      warning,
    })),
    updateInstalled: vi.fn(async () => ({
      ok: true,
      command: "npx -y skills update",
      message: "updated",
      warning,
    })),
    removeInstalled: vi.fn(async (opts?: { skills?: string[]; all?: boolean; global?: boolean; agents?: string[] }) => ({
      ok: true,
      command: "npx -y skills remove",
      message: "removed",
      warning,
      opts,
    })),
    getByName: vi.fn((name: string) => (name === "find-skills" ? sampleSkill : undefined)),
    toggle: vi.fn(() => true),
  } as unknown as MockSkillsService;

  return service;
}

function getTool(tools: ReturnType<typeof createSkillsTools>, name: string) {
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

describe("createSkillsTools", () => {
  it("exposes local skills list with warning and agent targets", async () => {
    const skillsService = buildServiceMock();
    const tools = createSkillsTools(skillsService);

    const result = await getTool(tools, "skills_list").execute({});
    expect(result).toMatchObject({
      total: 1,
      eligible: 1,
      warning,
      supportedAgents: ["codex", "cursor"],
    });
  });

  it("installs with default codex target when agents are omitted", async () => {
    const skillsService = buildServiceMock();
    const tools = createSkillsTools(skillsService);

    await getTool(tools, "skills_install").execute({
      reference: "  vercel-labs/skills@find-skills  ",
    });

    expect(skillsService.installFromRegistry).toHaveBeenCalledWith(
      "vercel-labs/skills@find-skills",
      { global: undefined, agents: ["codex"] },
    );
  });

  it("passes explicit install options through", async () => {
    const skillsService = buildServiceMock();
    const tools = createSkillsTools(skillsService);

    await getTool(tools, "skills_install").execute({
      reference: "org/repo@skill",
      global: false,
      agents: ["cursor", "codex"],
    });

    expect(skillsService.installFromRegistry).toHaveBeenCalledWith(
      "org/repo@skill",
      { global: false, agents: ["cursor", "codex"] },
    );
  });

  it("clamps discover pagination inputs", async () => {
    const skillsService = buildServiceMock();
    const tools = createSkillsTools(skillsService);

    await getTool(tools, "skills_discover").execute({
      page: -2,
      limit: 500,
    });

    expect(skillsService.discoverSkills).toHaveBeenCalledWith(0, 50);
  });

  it("validates remove parameters before calling service", async () => {
    const skillsService = buildServiceMock();
    const tools = createSkillsTools(skillsService);

    const result = await getTool(tools, "skills_remove").execute({});
    expect(result).toEqual({ ok: false, message: "provide references or set all=true" });
    expect(skillsService.removeInstalled).not.toHaveBeenCalled();
  });

  it("toggles local skills by name", async () => {
    const skillsService = buildServiceMock();
    const tools = createSkillsTools(skillsService);

    const result = await getTool(tools, "skills_toggle").execute({
      name: "find-skills",
      enabled: false,
    });

    expect(skillsService.toggle).toHaveBeenCalledWith("find-skills", false);
    expect(result).toMatchObject({ ok: true, name: "find-skills", enabled: false });
  });
});
