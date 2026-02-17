import type { AgentTool } from "../tools/types.js";

export type PluginManifest = {
  name: string;
  version: string;
  description: string;
  author?: string;
  main: string;
  tools?: string[];
  hooks?: string[];
};

export type PluginContext = {
  registerTool(tool: AgentTool): void;
  getService<T>(name: string): T | undefined;
  log: { info(msg: string): void; error(msg: string): void };
};

export type PluginModule = {
  activate(ctx: PluginContext): Promise<void>;
  deactivate?(): Promise<void>;
};

export type PluginInstance = {
  manifest: PluginManifest;
  module: PluginModule;
  active: boolean;
};
