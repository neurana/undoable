import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { PluginManifest, PluginModule, PluginInstance } from "./types.js";

export async function loadPlugin(pluginDir: string): Promise<PluginInstance> {
  const manifestPath = path.join(pluginDir, "plugin.json");
  const raw = await fsp.readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(raw) as PluginManifest;

  if (!manifest.name || !manifest.version || !manifest.main) {
    throw new Error(`Invalid plugin manifest in ${pluginDir}: name, version, and main are required`);
  }

  const entryPath = path.resolve(pluginDir, manifest.main);
  try {
    await fsp.access(entryPath);
  } catch {
    throw new Error(`Plugin entry point not found: ${entryPath}`);
  }

  const mod = (await import(/* webpackIgnore: true */ entryPath)) as PluginModule;

  if (typeof mod.activate !== "function") {
    throw new Error(`Plugin ${manifest.name} does not export an activate function`);
  }

  return {
    manifest,
    module: mod,
    active: false,
  };
}
