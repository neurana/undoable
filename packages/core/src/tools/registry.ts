import type { ToolAdapter } from "./types.js";

export class ToolRegistry {
  private adapters = new Map<string, ToolAdapter>();

  register(adapter: ToolAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Tool adapter "${adapter.id}" already registered`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): ToolAdapter | undefined {
    return this.adapters.get(id);
  }

  require(id: string): ToolAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new Error(`Tool adapter "${id}" not found`);
    }
    return adapter;
  }

  list(): ToolAdapter[] {
    return Array.from(this.adapters.values());
  }

  has(id: string): boolean {
    return this.adapters.has(id);
  }
}
