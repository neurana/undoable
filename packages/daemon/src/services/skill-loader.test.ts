import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  parseFrontmatter,
  loadSkillsFromDir,
  loadAllSkills,
  resolveSkillStatus,
  buildSkillsPrompt,
} from "./skill-loader.js";

describe("parseFrontmatter", () => {
  it("parses valid frontmatter", () => {
    const raw = `---
name: test-skill
description: A test skill
emoji: 🔧
---
# Instructions
Do the thing.`;
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter.name).toBe("test-skill");
    expect(frontmatter.description).toBe("A test skill");
    expect(frontmatter.emoji).toBe("🔧");
    expect(body).toBe("# Instructions\nDo the thing.");
  });

  it("returns empty frontmatter when no delimiters", () => {
    const raw = "Just plain text";
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(Object.keys(frontmatter)).toHaveLength(0);
    expect(body).toBe(raw);
  });

  it("handles frontmatter with metadata JSON", () => {
    const raw = `---
name: gh-skill
description: GitHub integration
metadata: {"undoable": {"emoji": "🐙", "requires": {"bins": ["gh"]}}}
---
Use gh CLI.`;
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter.name).toBe("gh-skill");
    expect(frontmatter.metadata).toContain("undoable");
    expect(body).toBe("Use gh CLI.");
  });

  it("handles missing closing delimiter", () => {
    const raw = `---
name: broken
description: No closing`;
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(Object.keys(frontmatter)).toHaveLength(0);
    expect(body).toBe(raw);
  });
});

describe("loadSkillsFromDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads skills from directory with SKILL.md files", () => {
    const skillDir = path.join(tmpDir, "my-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      `---
name: my-skill
description: My test skill
---
Do something.`,
    );

    const skills = loadSkillsFromDir(tmpDir, "bundled");
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe("my-skill");
    expect(skills[0]!.description).toBe("My test skill");
    expect(skills[0]!.source).toBe("bundled");
    expect(skills[0]!.body).toBe("Do something.");
  });

  it("skips directories without SKILL.md", () => {
    fs.mkdirSync(path.join(tmpDir, "no-skill"));
    fs.writeFileSync(path.join(tmpDir, "no-skill", "README.md"), "Not a skill");

    const skills = loadSkillsFromDir(tmpDir, "user");
    expect(skills).toHaveLength(0);
  });

  it("returns empty array for non-existent directory", () => {
    const skills = loadSkillsFromDir("/nonexistent/path", "bundled");
    expect(skills).toHaveLength(0);
  });

  it("uses directory name as fallback when name not in frontmatter", () => {
    const skillDir = path.join(tmpDir, "fallback-name");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      `---
description: No name field
---
Body text.`,
    );

    const skills = loadSkillsFromDir(tmpDir, "workspace");
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe("fallback-name");
  });

  it("parses requires from metadata", () => {
    const skillDir = path.join(tmpDir, "needs-bins");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      `---
name: needs-bins
description: Needs binaries
metadata: {"undoable": {"requires": {"bins": ["git", "node"], "env": ["API_KEY"]}}}
---
Instructions.`,
    );

    const skills = loadSkillsFromDir(tmpDir, "bundled");
    expect(skills).toHaveLength(1);
    expect(skills[0]!.requires?.bins).toEqual(["git", "node"]);
    expect(skills[0]!.requires?.env).toEqual(["API_KEY"]);
  });
});

describe("resolveSkillStatus", () => {
  const baseSkill = {
    name: "test",
    description: "Test",
    filePath: "/tmp/test/SKILL.md",
    baseDir: "/tmp/test",
    source: "bundled" as const,
    body: "Body",
  };

  it("marks skill as eligible when no requirements", () => {
    const status = resolveSkillStatus(baseSkill, new Set());
    expect(status.eligible).toBe(true);
    expect(status.disabled).toBe(false);
  });

  it("marks skill as disabled when in disabled set", () => {
    const status = resolveSkillStatus(baseSkill, new Set(["test"]));
    expect(status.disabled).toBe(true);
    expect(status.eligible).toBe(false);
  });

  it("marks skill as ineligible with missing env", () => {
    const skill = { ...baseSkill, requires: { env: ["NONEXISTENT_VAR_XYZ"] } };
    const status = resolveSkillStatus(skill, new Set());
    expect(status.eligible).toBe(false);
    expect(status.missing.env).toContain("NONEXISTENT_VAR_XYZ");
  });
});

describe("buildSkillsPrompt", () => {
  it("builds XML prompt for eligible skills", () => {
    const skills = [
      {
        name: "skill-a",
        description: "Skill A",
        filePath: "/tmp/a/SKILL.md",
        baseDir: "/tmp/a",
        source: "bundled" as const,
        body: "Do A things.",
        eligible: true,
        disabled: false,
        missing: { bins: [], env: [] },
      },
    ];
    const prompt = buildSkillsPrompt(skills);
    expect(prompt).toContain("<available_skills>");
    expect(prompt).toContain('name="skill-a"');
    expect(prompt).toContain("Do A things.");
    expect(prompt).toContain("</available_skills>");
  });

  it("returns empty string when no eligible skills", () => {
    const skills = [
      {
        name: "disabled",
        description: "Off",
        filePath: "/tmp/d/SKILL.md",
        baseDir: "/tmp/d",
        source: "bundled" as const,
        body: "Nope.",
        eligible: false,
        disabled: true,
        missing: { bins: [], env: [] },
      },
    ];
    const prompt = buildSkillsPrompt(skills);
    expect(prompt).toBe("");
  });

  it("filters out ineligible skills from prompt", () => {
    const skills = [
      {
        name: "ok",
        description: "OK",
        filePath: "/tmp/ok/SKILL.md",
        baseDir: "/tmp/ok",
        source: "bundled" as const,
        body: "OK body.",
        eligible: true,
        disabled: false,
        missing: { bins: [], env: [] },
      },
      {
        name: "nope",
        description: "Nope",
        filePath: "/tmp/nope/SKILL.md",
        baseDir: "/tmp/nope",
        source: "bundled" as const,
        body: "Nope body.",
        eligible: false,
        disabled: false,
        missing: { bins: ["missing-bin"], env: [] },
      },
    ];
    const prompt = buildSkillsPrompt(skills);
    expect(prompt).toContain("ok");
    expect(prompt).not.toContain("Nope body.");
  });
});

describe("loadAllSkills", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-all-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("applies precedence: workspace overrides user overrides bundled", () => {
    const bundled = path.join(tmpDir, "bundled");
    const user = path.join(tmpDir, "user");
    const ws = path.join(tmpDir, "ws");
    const wsSkills = path.join(ws, "skills");

    for (const d of [bundled, user, wsSkills]) {
      fs.mkdirSync(path.join(d, "dupe"), { recursive: true });
    }
    fs.writeFileSync(
      path.join(bundled, "dupe", "SKILL.md"),
      "---\nname: dupe\ndescription: bundled\n---\nbundled body",
    );
    fs.writeFileSync(
      path.join(user, "dupe", "SKILL.md"),
      "---\nname: dupe\ndescription: user\n---\nuser body",
    );
    fs.writeFileSync(
      path.join(wsSkills, "dupe", "SKILL.md"),
      "---\nname: dupe\ndescription: workspace\n---\nworkspace body",
    );

    const skills = loadAllSkills({
      bundledDir: bundled,
      userDir: user,
      workspaceDir: ws,
      includeBundled: true,
    });

    expect(skills).toHaveLength(1);
    expect(skills[0]!.description).toBe("workspace");
    expect(skills[0]!.source).toBe("workspace");
  });

  it("loads agent skill directories and keeps primary user dir precedence", () => {
    const user = path.join(tmpDir, "user");
    const agent = path.join(tmpDir, "agent");

    fs.mkdirSync(path.join(user, "dupe"), { recursive: true });
    fs.mkdirSync(path.join(agent, "dupe"), { recursive: true });
    fs.mkdirSync(path.join(agent, "agent-only"), { recursive: true });

    fs.writeFileSync(
      path.join(agent, "dupe", "SKILL.md"),
      "---\nname: dupe\ndescription: agent\n---\nagent body",
    );
    fs.writeFileSync(
      path.join(user, "dupe", "SKILL.md"),
      "---\nname: dupe\ndescription: user\n---\nuser body",
    );
    fs.writeFileSync(
      path.join(agent, "agent-only", "SKILL.md"),
      "---\nname: agent-only\ndescription: agent-only\n---\nagent only body",
    );

    const skills = loadAllSkills({
      userDir: user,
      extraUserDirs: [agent],
    });

    const byName = new Map(skills.map((skill) => [skill.name, skill]));
    expect(byName.get("dupe")?.description).toBe("user");
    expect(byName.get("agent-only")?.description).toBe("agent-only");
  });
});
