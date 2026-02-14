import path from "node:path";
import os from "node:os";
import fsp from "node:fs/promises";
import fs from "node:fs";
import type { AgentConfig } from "@undoable/shared";

const AGENTS_FILE = path.join(os.homedir(), ".undoable", "agents.json");

type PersistedData = {
  version: 1;
  defaultId?: string;
  agents: AgentConfig[];
};

export class AgentRegistry {
  private agents = new Map<string, AgentConfig>();
  private defaultId: string | undefined;
  private persistEnabled = false;

  async init(): Promise<void> {
    this.persistEnabled = true;
    try {
      const dir = path.dirname(AGENTS_FILE);
      await fsp.mkdir(dir, { recursive: true });
      if (fs.existsSync(AGENTS_FILE)) {
        const raw = await fsp.readFile(AGENTS_FILE, "utf-8");
        const data = JSON.parse(raw) as PersistedData;
        for (const agent of data.agents) {
          this.agents.set(agent.id, agent);
        }
        if (data.defaultId && this.agents.has(data.defaultId)) {
          this.defaultId = data.defaultId;
        } else if (this.agents.size > 0) {
          this.defaultId = this.agents.keys().next().value;
        }
      }
    } catch { }
  }

  private persist(): void {
    if (!this.persistEnabled) return;
    const data: PersistedData = {
      version: 1,
      defaultId: this.defaultId,
      agents: Array.from(this.agents.values()),
    };
    fsp.writeFile(AGENTS_FILE, JSON.stringify(data, null, 2), "utf-8").catch(() => {});
  }

  register(config: AgentConfig): void {
    this.agents.set(config.id, config);
    if (config.default || this.agents.size === 1) {
      this.defaultId = config.id;
    }
    this.persist();
  }

  get(id: string): AgentConfig | undefined {
    return this.agents.get(id);
  }

  require(id: string): AgentConfig {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent "${id}" not found`);
    return agent;
  }

  getDefault(): AgentConfig {
    if (!this.defaultId) throw new Error("No agents registered");
    return this.require(this.defaultId);
  }

  getDefaultId(): string {
    if (!this.defaultId) throw new Error("No agents registered");
    return this.defaultId;
  }

  update(id: string, patch: Partial<Omit<AgentConfig, "id">>): AgentConfig | undefined {
    const existing = this.agents.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch, id };
    this.agents.set(id, updated);
    if (updated.default) this.defaultId = id;
    this.persist();
    return updated;
  }

  remove(id: string): boolean {
    const existed = this.agents.delete(id);
    if (existed && this.defaultId === id) {
      const first = this.agents.keys().next().value;
      this.defaultId = first ?? undefined;
    }
    if (existed) this.persist();
    return existed;
  }

  list(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  listIds(): string[] {
    return Array.from(this.agents.keys());
  }
}
