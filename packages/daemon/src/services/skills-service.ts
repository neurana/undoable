import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  loadAllSkills,
  resolveSkillStatus,
  buildSkillsPrompt,
  type SkillStatus,
} from "./skill-loader.js";

const execFileAsync = promisify(execFile);
const UNDOABLE_DIR = path.join(os.homedir(), ".undoable");
const CONFIG_FILE = path.join(UNDOABLE_DIR, "skills.json");
const USER_SKILLS_DIR = path.join(UNDOABLE_DIR, "skills");
const SKILLS_DOCS_URL = "https://skills.sh/docs";
const SKILLS_CLI_DOCS_URL = "https://skills.sh/docs/cli";
const SKILLS_FIND_SKILL_URL = "https://skills.sh/vercel-labs/skills/find-skills";
const DEFAULT_FIND_SKILLS_REF = "vercel-labs/skills@find-skills";
const SUPPORTED_SKILLS_AGENTS = [
  "claude-code",
  "codex",
  "cursor",
  "windsurf",
  "opencode",
] as const;

export type SkillsConfig = {
  disabled: string[];
};

export type SkillsDangerWarning = {
  title: string;
  message: string;
  docs: string[];
};

export type SkillsSearchResult = {
  reference: string;
  repo: string;
  skill: string;
  url: string;
  installCommand: string;
  recommended?: boolean;
};

export type SkillsSearchResponse = {
  ok: boolean;
  query: string;
  warning: SkillsDangerWarning;
  results: SkillsSearchResult[];
  error?: string;
};

export type SkillsInstallResponse = {
  ok: boolean;
  installed: boolean;
  reference: string;
  message: string;
  warning: SkillsDangerWarning;
  stdout?: string;
  stderr?: string;
};

export type SkillsCliCommandResponse = {
  ok: boolean;
  command: string;
  message: string;
  warning: SkillsDangerWarning;
  stdout?: string;
  stderr?: string;
};

export type SkillsListResponse = SkillsCliCommandResponse & {
  entries: string[];
};

export type SkillAgentTarget = (typeof SUPPORTED_SKILLS_AGENTS)[number];

function normalizeSkillDirName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseSkillReferences(output: string): string[] {
  const refs = new Set<string>();
  const refRegex = /([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = refRegex.exec(output)) !== null) {
    refs.add(match[1]!);
  }
  return [...refs].sort((a, b) => a.localeCompare(b));
}

function normalizeAgentTargets(agents?: string[]): SkillAgentTarget[] {
  if (!Array.isArray(agents)) return [];
  const allowed = new Set(SUPPORTED_SKILLS_AGENTS);
  const cleaned = agents
    .map((agent) => agent.trim().toLowerCase())
    .filter((agent): agent is SkillAgentTarget => allowed.has(agent as SkillAgentTarget));
  return [...new Set(cleaned)];
}

function appendAgentArgs(base: string[], agents?: string[]): string[] {
  const targets = normalizeAgentTargets(agents);
  if (targets.length === 0) return base;
  const next = [...base];
  for (const agent of targets) {
    next.push("--agent", agent);
  }
  return next;
}

function defaultSkillContent(name: string, description?: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description?.trim() || `Custom skill ${name}`}`,
    "---",
    "",
    `# ${name}`,
    "",
    "Describe what this skill does and how the assistant should use it.",
    "",
  ].join("\n");
}

function parseRepositoryReference(reference: string): { repo: string; skill?: string } | null {
  const trimmed = reference.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)(?:@([a-zA-Z0-9._-]+))?$/);
  if (!match) return null;
  return {
    repo: match[1]!,
    skill: match[2],
  };
}

function parseSkillsShUrls(output: string): SkillsSearchResult[] {
  const seen = new Set<string>();
  const results: SkillsSearchResult[] = [];
  const regex = /https:\/\/skills\.sh\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(output)) !== null) {
    const owner = match[1]!;
    const repoName = match[2]!;
    const skill = match[3]!;
    const repo = `${owner}/${repoName}`;
    const reference = `${repo}@${skill}`;
    if (seen.has(reference)) continue;
    seen.add(reference);
    const url = `https://skills.sh/${owner}/${repoName}/${skill}`;
    results.push({
      reference,
      repo,
      skill,
      url,
      installCommand: `npx skills add ${repo} --skill ${skill} -g --agent <agent> -y`,
    });
  }
  return results;
}

function defaultFindSkillsSuggestion(): SkillsSearchResult {
  return {
    reference: DEFAULT_FIND_SKILLS_REF,
    repo: "vercel-labs/skills",
    skill: "find-skills",
    url: SKILLS_FIND_SKILL_URL,
    installCommand: "npx skills add vercel-labs/skills --skill find-skills -g --agent <agent> -y",
    recommended: true,
  };
}

export class SkillsService {
  private skills: SkillStatus[] = [];
  private config: SkillsConfig = { disabled: [] };
  private workspaceDir?: string;
  private discoverCache: SkillsSearchResult[] = [];
  private discoverCacheTime = 0;
  private searchCache = new Map<string, { results: SkillsSearchResult[]; time: number }>();
  private static readonly CACHE_TTL = 300_000;

  constructor(opts?: { workspaceDir?: string }) {
    this.workspaceDir = opts?.workspaceDir;
    this.loadConfig();
    this.refresh();
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        this.config = {
          disabled: Array.isArray(parsed.disabled) ? parsed.disabled : [],
        };
      }
    } catch {
      this.config = { disabled: [] };
    }
  }

  private saveConfig(): void {
    try {
      const dir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch {
      // best effort
    }
  }

  refresh(): SkillStatus[] {
    const loaded = loadAllSkills({ workspaceDir: this.workspaceDir });
    const disabledSet = new Set(this.config.disabled);
    this.skills = loaded.map((s) => resolveSkillStatus(s, disabledSet));
    return this.skills;
  }

  getDangerWarning(): SkillsDangerWarning {
    return {
      title: "Third-party skills can be dangerous",
      message:
        "Skills from skills.sh are community-maintained. Review skill content before enabling because some skills may execute commands, access files, or use networked tools.",
      docs: [SKILLS_DOCS_URL, SKILLS_CLI_DOCS_URL, SKILLS_FIND_SKILL_URL],
    };
  }

  getSupportedAgents(): SkillAgentTarget[] {
    return [...SUPPORTED_SKILLS_AGENTS];
  }

  private async runSkillsCommand(args: string[], message: string): Promise<SkillsCliCommandResponse> {
    const warning = this.getDangerWarning();
    const command = `npx ${args.join(" ")}`;
    try {
      const { stdout, stderr } = await execFileAsync("npx", args, {
        timeout: 120_000,
        env: {
          ...process.env,
          DISABLE_TELEMETRY: "1",
          DO_NOT_TRACK: "1",
        },
        maxBuffer: 1024 * 1024,
      });
      return {
        ok: true,
        command,
        message,
        warning,
        stdout,
        stderr,
      };
    } catch (err) {
      return {
        ok: false,
        command,
        message: err instanceof Error ? err.message : String(err),
        warning,
      };
    }
  }

  async listInstalled(opts?: { global?: boolean; agents?: string[] }): Promise<SkillsListResponse> {
    const args = ["-y", "skills", "list"];
    if (opts?.global === true) {
      args.push("-g");
    }
    const withAgents = appendAgentArgs(args, opts?.agents);
    const result = await this.runSkillsCommand(withAgents, "listed installed skills");
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    return {
      ...result,
      entries: parseSkillReferences(output),
    };
  }

  async checkForUpdates(): Promise<SkillsCliCommandResponse> {
    return this.runSkillsCommand(["-y", "skills", "check"], "checked for skill updates");
  }

  async updateInstalled(): Promise<SkillsCliCommandResponse> {
    const result = await this.runSkillsCommand(["-y", "skills", "update"], "updated installed skills");
    if (result.ok) {
      this.refresh();
    }
    return result;
  }

  async removeInstalled(opts: {
    skills?: string[];
    all?: boolean;
    global?: boolean;
    agents?: string[];
  }): Promise<SkillsCliCommandResponse> {
    const names = (opts.skills ?? []).map((skill) => skill.trim()).filter(Boolean);
    if (!opts.all && names.length === 0) {
      return {
        ok: false,
        command: "",
        message: "provide at least one skill reference or set all=true",
        warning: this.getDangerWarning(),
      };
    }

    const args = ["-y", "skills", "remove"];
    if (opts.all) {
      args.push("--all");
    } else {
      args.push(...names);
    }
    if (opts.global === true) {
      args.push("-g");
    }
    const withAgents = appendAgentArgs(args, opts.agents);
    withAgents.push("-y");

    const result = await this.runSkillsCommand(withAgents, "removed selected skills");
    if (result.ok) {
      this.refresh();
    }
    return result;
  }

  async searchRegistry(query?: string): Promise<SkillsSearchResponse> {
    const normalizedQuery = query?.trim() || "find skills";
    const warning = this.getDangerWarning();
    const cacheKey = normalizedQuery.toLowerCase();
    const now = Date.now();

    const cached = this.searchCache.get(cacheKey);
    if (cached && now - cached.time < SkillsService.CACHE_TTL) {
      return { ok: true, query: normalizedQuery, warning, results: cached.results };
    }

    try {
      const { stdout, stderr } = await execFileAsync(
        "npx",
        ["-y", "skills", "find", normalizedQuery],
        {
          timeout: 120_000,
          env: { ...process.env, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" },
          maxBuffer: 1024 * 1024,
        },
      );

      const parsed = parseSkillsShUrls(`${stdout}\n${stderr}`);
      const recommendation = defaultFindSkillsSuggestion();
      const hasRecommendation = parsed.some((item) => item.reference === recommendation.reference);
      const results = hasRecommendation ? parsed : [recommendation, ...parsed];

      this.searchCache.set(cacheKey, { results, time: now });

      return { ok: true, query: normalizedQuery, warning, results };
    } catch (err) {
      if (cached) {
        return { ok: true, query: normalizedQuery, warning, results: cached.results };
      }
      const recommendation = defaultFindSkillsSuggestion();
      return {
        ok: false,
        query: normalizedQuery,
        warning,
        results: [recommendation],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async discoverSkills(page: number, limit: number): Promise<{
    ok: boolean;
    warning: SkillsDangerWarning;
    results: SkillsSearchResult[];
    hasMore: boolean;
    error?: string;
  }> {
    const warning = this.getDangerWarning();
    const now = Date.now();

    if (this.discoverCache.length === 0 || now - this.discoverCacheTime > SkillsService.CACHE_TTL) {
      try {
        const { stdout, stderr } = await execFileAsync(
          "npx",
          ["-y", "skills", "find", "popular skills"],
          {
            timeout: 120_000,
            env: { ...process.env, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" },
            maxBuffer: 1024 * 1024,
          },
        );

        const parsed = parseSkillsShUrls(`${stdout}\n${stderr}`);
        const recommendation = defaultFindSkillsSuggestion();
        const hasRecommendation = parsed.some((item) => item.reference === recommendation.reference);
        this.discoverCache = hasRecommendation ? parsed : [recommendation, ...parsed];
        this.discoverCacheTime = now;
      } catch (err) {
        if (this.discoverCache.length === 0) {
          const recommendation = defaultFindSkillsSuggestion();
          return {
            ok: false,
            warning,
            results: [recommendation],
            hasMore: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    }

    const start = page * limit;
    const end = start + limit;
    const results = this.discoverCache.slice(start, end);
    const hasMore = end < this.discoverCache.length;

    return {
      ok: true,
      warning,
      results,
      hasMore,
    };
  }

  async installFromRegistry(reference: string, opts?: { global?: boolean; agents?: string[] }): Promise<SkillsInstallResponse> {
    const parsed = parseRepositoryReference(reference);
    const warning = this.getDangerWarning();
    if (!parsed) {
      return {
        ok: false,
        installed: false,
        reference,
        message: "invalid reference format. expected owner/repo or owner/repo@skill-name",
        warning,
      };
    }

    const agentTargets = normalizeAgentTargets(opts?.agents);
    if (agentTargets.length === 0) {
      return {
        ok: false,
        installed: false,
        reference,
        message: `select at least one agent target (${SUPPORTED_SKILLS_AGENTS.join(", ")})`,
        warning,
      };
    }

    const args = ["-y", "skills", "add", parsed.repo];
    if (parsed.skill) {
      args.push("--skill", parsed.skill);
    }
    if (opts?.global !== false) {
      args.push("-g");
    }
    for (const agent of agentTargets) {
      args.push("--agent", agent);
    }
    args.push("-y");

    try {
      const { stdout, stderr } = await execFileAsync("npx", args, {
        timeout: 120_000,
        env: {
          ...process.env,
          DISABLE_TELEMETRY: "1",
          DO_NOT_TRACK: "1",
        },
        maxBuffer: 1024 * 1024,
      });
      this.refresh();
      return {
        ok: true,
        installed: true,
        reference,
        message: `installed ${reference}`,
        warning,
        stdout,
        stderr,
      };
    } catch (err) {
      return {
        ok: false,
        installed: false,
        reference,
        message: err instanceof Error ? err.message : String(err),
        warning,
      };
    }
  }

  list(): SkillStatus[] {
    return this.skills;
  }

  getByName(name: string): SkillStatus | undefined {
    return this.skills.find((s) => s.name === name);
  }

  toggle(name: string, enabled: boolean): boolean {
    const idx = this.config.disabled.indexOf(name);
    if (enabled && idx >= 0) {
      this.config.disabled.splice(idx, 1);
    } else if (!enabled && idx < 0) {
      this.config.disabled.push(name);
    }
    this.saveConfig();
    this.refresh();
    return true;
  }

  getPrompt(): string {
    return buildSkillsPrompt(this.skills);
  }

  eligibleCount(): number {
    return this.skills.filter((s) => s.eligible).length;
  }

  totalCount(): number {
    return this.skills.length;
  }

  bins(): string[] {
    const bins = new Set<string>();
    for (const skill of this.skills) {
      for (const bin of skill.requires?.bins ?? []) {
        bins.add(bin);
      }
    }
    return [...bins].sort((a, b) => a.localeCompare(b));
  }

  install(name: string, opts?: { content?: string; description?: string }): {
    ok: boolean;
    installed: boolean;
    message: string;
    skill?: SkillStatus;
  } {
    const trimmed = name.trim();
    if (!trimmed) {
      return { ok: false, installed: false, message: "name is required" };
    }

    const existing = this.getByName(trimmed);
    if (existing) {
      return {
        ok: true,
        installed: false,
        message: `skill \"${trimmed}\" already installed`,
        skill: existing,
      };
    }

    const dirName = normalizeSkillDirName(trimmed);
    if (!dirName) {
      return { ok: false, installed: false, message: "invalid skill name" };
    }

    try {
      const skillDir = path.join(USER_SKILLS_DIR, dirName);
      if (!fs.existsSync(skillDir)) {
        fs.mkdirSync(skillDir, { recursive: true });
      }
      const skillFile = path.join(skillDir, "SKILL.md");
      const content = opts?.content?.trim() || defaultSkillContent(trimmed, opts?.description);
      fs.writeFileSync(skillFile, content, "utf-8");
      this.refresh();
      const installed = this.getByName(trimmed);
      return {
        ok: true,
        installed: true,
        message: `installed skill \"${trimmed}\"`,
        skill: installed,
      };
    } catch (err) {
      return {
        ok: false,
        installed: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
