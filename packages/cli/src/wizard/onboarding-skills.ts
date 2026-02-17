import * as fs from "node:fs";
import { execSync } from "node:child_process";
import type { WizardPrompter } from "./prompts.js";
import { ensureUndoableDir, SKILLS_FILE } from "./onboarding-helpers.js";

type SkillDef = {
  id: string;
  name: string;
  hint: string;
  requires?: { bins?: string[] };
};

const BUILT_IN_SKILLS: SkillDef[] = [
  {
    id: "github",
    name: "GitHub",
    hint: "gh CLI interactions (issues, PRs, repos)",
    requires: { bins: ["gh"] },
  },
  {
    id: "web-search",
    name: "Web Search",
    hint: "Browse and search the web",
  },
];

function detectBinary(name: string): boolean {
  try {
    const cmd =
      process.platform === "win32" ? `where ${name}` : `which ${name}`;
    execSync(cmd, { encoding: "utf-8", timeout: 3000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function setupSkills(prompter: WizardPrompter): Promise<string[]> {
  const skills = BUILT_IN_SKILLS.map((skill) => {
    const missingBins = (skill.requires?.bins ?? []).filter(
      (bin) => !detectBinary(bin),
    );
    return { ...skill, missingBins, eligible: missingBins.length === 0 };
  });

  const eligibleCount = skills.filter((s) => s.eligible).length;
  const missingCount = skills.filter((s) => !s.eligible).length;

  await prompter.note(
    [
      `Available skills: ${skills.length}`,
      `Ready: ${eligibleCount}`,
      ...(missingCount > 0 ? [`Missing requirements: ${missingCount}`] : []),
      ...skills
        .filter((s) => !s.eligible)
        .map((s) => `  ${s.name}: needs ${s.missingBins.join(", ")}`),
    ].join("\n"),
    "Skills",
  );

  const shouldConfigure = await prompter.confirm({
    message: "Enable skills?",
    initialValue: true,
  });

  if (!shouldConfigure) return [];

  const selected = await prompter.multiselect<string>({
    message: "Select skills to enable",
    options: skills.map((s) => ({
      value: s.id,
      label: s.name,
      hint: s.eligible
        ? s.hint
        : `${s.hint} (missing: ${s.missingBins.join(", ")})`,
    })),
    initialValues: skills.filter((s) => s.eligible).map((s) => s.id),
  });

  writeSkillsConfig(selected);
  return selected;
}

function writeSkillsConfig(enabled: string[]) {
  ensureUndoableDir();
  const state = {
    version: 1,
    enabled,
  };
  fs.writeFileSync(SKILLS_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}
