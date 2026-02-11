import type { LLMProvider, LLMProviderConfig } from "./types.js";

export class LLMProviderRegistry {
  private providers = new Map<string, LLMProvider>();
  private defaultId: string | null = null;

  register(provider: LLMProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`LLM provider "${provider.id}" already registered`);
    }
    this.providers.set(provider.id, provider);
    if (this.providers.size === 1) {
      this.defaultId = provider.id;
    }
  }

  get(id: string): LLMProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`LLM provider "${id}" not found`);
    return provider;
  }

  getDefault(): LLMProvider {
    if (!this.defaultId) throw new Error("No LLM providers registered");
    return this.get(this.defaultId);
  }

  setDefault(id: string): void {
    if (!this.providers.has(id)) throw new Error(`LLM provider "${id}" not found`);
    this.defaultId = id;
  }

  resolve(config?: LLMProviderConfig): LLMProvider {
    if (config?.provider) return this.get(config.provider);
    return this.getDefault();
  }

  list(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }
}
