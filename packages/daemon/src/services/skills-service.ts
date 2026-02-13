import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  loadAllSkills,
  resolveSkillStatus,
  buildSkillsPrompt,
  type SkillStatus,
} from "./skill-loader.js";

const UNDOABLE_DIR = path.join(os.homedir(), ".undoable");
const CONFIG_FILE = path.join(UNDOABLE_DIR, "skills.json");

export type SkillsConfig = {
  disabled: string[];
};

export class SkillsService {
  private skills: SkillStatus[] = [];
  private config: SkillsConfig = { disabled: [] };
  private workspaceDir?: string;

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
}
