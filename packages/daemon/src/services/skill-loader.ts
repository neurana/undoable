import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// ---------- types ----------

export type SkillFrontmatter = {
  name: string;
  description: string;
  emoji?: string;
  homepage?: string;
  requires?: {
    bins?: string[];
    env?: string[];
  };
};

export type LoadedSkill = {
  name: string;
  description: string;
  emoji?: string;
  homepage?: string;
  filePath: string;
  baseDir: string;
  source: "bundled" | "user" | "workspace";
  body: string;
  requires?: { bins?: string[]; env?: string[] };
};

export type SkillStatus = LoadedSkill & {
  eligible: boolean;
  disabled: boolean;
  missing: { bins: string[]; env: string[] };
};

// ---------- frontmatter parser ----------

const FM_DELIM = "---";

export function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== FM_DELIM) return { frontmatter: {}, body: raw };

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === FM_DELIM) { endIdx = i; break; }
  }
  if (endIdx < 0) return { frontmatter: {}, body: raw };

  const fm: Record<string, string> = {};
  for (let i = 1; i < endIdx; i++) {
    const line = lines[i]!;
    const colon = line.indexOf(":");
    if (colon > 0) {
      const key = line.slice(0, colon).trim();
      const val = line.slice(colon + 1).trim();
      fm[key] = val;
    }
  }
  const body = lines.slice(endIdx + 1).join("\n").trim();
  return { frontmatter: fm, body };
}

function parseRequires(metadataStr: string | undefined): { bins?: string[]; env?: string[] } | undefined {
  if (!metadataStr) return undefined;
  try {
    const parsed = JSON.parse(metadataStr);
    const meta = parsed?.undoable ?? parsed?.openclaw ?? parsed;
    const req = meta?.requires;
    if (!req) return undefined;
    return {
      bins: Array.isArray(req.bins) ? req.bins : undefined,
      env: Array.isArray(req.env) ? req.env : undefined,
    };
  } catch {
    return undefined;
  }
}

function parseEmoji(metadataStr: string | undefined, fmEmoji: string | undefined): string | undefined {
  if (fmEmoji) return fmEmoji;
  if (!metadataStr) return undefined;
  try {
    const parsed = JSON.parse(metadataStr);
    const meta = parsed?.undoable ?? parsed?.openclaw ?? parsed;
    return meta?.emoji;
  } catch {
    return undefined;
  }
}

// ---------- directory scanner ----------

export function loadSkillsFromDir(dir: string, source: LoadedSkill["source"]): LoadedSkill[] {
  if (!fs.existsSync(dir)) return [];
  const skills: LoadedSkill[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(dir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;

    try {
      const raw = fs.readFileSync(skillFile, "utf-8");
      const { frontmatter: fm, body } = parseFrontmatter(raw);
      const name = fm.name || entry.name;
      const description = fm.description || "";
      const requires = parseRequires(fm.metadata);
      const emoji = parseEmoji(fm.metadata, fm.emoji);
      const homepage = fm.homepage;

      skills.push({
        name,
        description,
        emoji,
        homepage,
        filePath: skillFile,
        baseDir: path.join(dir, entry.name),
        source,
        body,
        requires,
      });
    } catch {
      // skip malformed skills
    }
  }
  return skills;
}

// ---------- multi-source loader ----------

const UNDOABLE_DIR = path.join(os.homedir(), ".undoable");
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_AGENT_SKILLS_DIRS = [
  path.join(os.homedir(), ".codex", "skills"),
  path.join(os.homedir(), ".claude", "skills"),
  path.join(os.homedir(), ".cursor", "skills"),
  path.join(os.homedir(), ".cursor", "skills-cursor"),
  path.join(os.homedir(), ".windsurf", "skills"),
  path.join(os.homedir(), ".codeium", "windsurf", "skills"),
  path.join(os.homedir(), ".opencode", "skills"),
];

export function loadAllSkills(opts?: {
  workspaceDir?: string;
  bundledDir?: string;
  userDir?: string;
  extraUserDirs?: string[];
  includeBundled?: boolean;
}): LoadedSkill[] {
  const bundledDir = opts?.bundledDir ?? path.join(path.resolve(MODULE_DIR, "../.."), "skills");
  const userDir = opts?.userDir ?? path.join(UNDOABLE_DIR, "skills");
  const candidateUserDirs = opts?.extraUserDirs ?? (opts?.userDir ? [] : DEFAULT_AGENT_SKILLS_DIRS);
  const userDirs = Array.from(
    new Set(
      [...candidateUserDirs, userDir].map((dir) => path.resolve(dir)),
    ),
  );
  const workspaceDir = opts?.workspaceDir;
  const includeBundled = opts?.includeBundled === true;

  const merged = new Map<string, LoadedSkill>();

  // Precedence: bundled < user < workspace
  if (includeBundled) {
    for (const skill of loadSkillsFromDir(bundledDir, "bundled")) {
      merged.set(skill.name, skill);
    }
  }
  for (const dir of userDirs) {
    for (const skill of loadSkillsFromDir(dir, "user")) {
      merged.set(skill.name, skill);
    }
  }
  if (workspaceDir) {
    const wsSkills = path.join(workspaceDir, "skills");
    for (const skill of loadSkillsFromDir(wsSkills, "workspace")) {
      merged.set(skill.name, skill);
    }
  }

  return Array.from(merged.values());
}

// ---------- eligibility ----------

function hasBinary(bin: string): boolean {
  const pathEnv = process.env.PATH || "";
  const dirs = pathEnv.split(path.delimiter);
  for (const dir of dirs) {
    const full = path.join(dir, bin);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      return true;
    } catch { /* not found */ }
  }
  return false;
}

export function resolveSkillStatus(
  skill: LoadedSkill,
  disabledSet: Set<string>,
): SkillStatus {
  const disabled = disabledSet.has(skill.name);
  const missingBins = (skill.requires?.bins ?? []).filter((b) => !hasBinary(b));
  const missingEnv = (skill.requires?.env ?? []).filter((e) => !process.env[e]);

  const eligible = !disabled && missingBins.length === 0 && missingEnv.length === 0;

  return {
    ...skill,
    eligible,
    disabled,
    missing: { bins: missingBins, env: missingEnv },
  };
}

// ---------- prompt builder ----------

export function buildSkillsPrompt(skills: SkillStatus[]): string {
  const eligible = skills.filter((s) => s.eligible);
  if (eligible.length === 0) return "";

  const parts = ["<available_skills>"];
  for (const s of eligible) {
    parts.push(`<skill name="${xmlEscape(s.name)}" description="${xmlEscape(s.description)}" location="${xmlEscape(s.filePath)}">`);
    parts.push(s.body);
    parts.push("</skill>");
  }
  parts.push("</available_skills>");
  return parts.join("\n");
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
