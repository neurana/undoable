import type { AgentConfig } from "@undoable/shared";

export class AgentRegistry {
  private agents = new Map<string, AgentConfig>();
  private defaultId: string | undefined;

  register(config: AgentConfig): void {
    this.agents.set(config.id, config);
    if (config.default || this.agents.size === 1) {
      this.defaultId = config.id;
    }
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

  list(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  listIds(): string[] {
    return Array.from(this.agents.keys());
  }
}
