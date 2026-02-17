import * as fsp from "node:fs/promises";
import * as path from "node:path";
import os from "node:os";
import type { PluginManifest, PluginContext, PluginInstance } from "./types.js";
import { loadPlugin } from "./loader.js";

const PLUGINS_DIR = path.join(os.homedir(), ".undoable", "plugins");

export class PluginRegistry {
  private plugins = new Map<string, PluginInstance>();

  async loadAll(pluginsDir?: string): Promise<void> {
    const dir = pluginsDir ?? PLUGINS_DIR;
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pluginDir = path.join(dir, entry.name);
        try {
          const hasManifest = await fsp.access(path.join(pluginDir, "plugin.json")).then(() => true).catch(() => false);
          if (!hasManifest) continue;
          const instance = await loadPlugin(pluginDir);
          this.plugins.set(instance.manifest.name, instance);
        } catch {
          // Skip invalid plugins
        }
      }
    } catch {
      // Plugins directory doesn't exist yet
    }
  }

  async activate(name: string, ctx: PluginContext): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) throw new Error(`Plugin not found: ${name}`);
    if (plugin.active) return;
    await plugin.module.activate(ctx);
    plugin.active = true;
  }

  async deactivate(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) throw new Error(`Plugin not found: ${name}`);
    if (!plugin.active) return;
    if (plugin.module.deactivate) {
      await plugin.module.deactivate();
    }
    plugin.active = false;
  }

  async activateAll(ctx: PluginContext): Promise<void> {
    for (const [name] of this.plugins) {
      try {
        await this.activate(name, ctx);
      } catch {
        // Skip plugins that fail to activate
      }
    }
  }

  list(): Array<PluginManifest & { active: boolean }> {
    return Array.from(this.plugins.values()).map((p) => ({
      ...p.manifest,
      active: p.active,
    }));
  }

  get(name: string): PluginInstance | undefined {
    return this.plugins.get(name);
  }
}
