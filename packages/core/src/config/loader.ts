import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DEFAULT_CONFIG, mergeConfig, validateConfig } from "./schema.js";
import type { UndoableConfig, ConfigSource } from "./types.js";

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".undoable");
const GLOBAL_CONFIG_FILE = "config.yaml";
const PROJECT_CONFIG_DIR = ".undoable";
const PROJECT_CONFIG_FILE = "config.yaml";

export type LoadResult = {
  config: UndoableConfig;
  sources: ConfigSource[];
  errors: string[];
};

export function loadConfig(projectDir?: string): LoadResult {
  const sources: ConfigSource[] = ["default"];
  const errors: string[] = [];
  let config = structuredClone(DEFAULT_CONFIG);

  const globalPath = path.join(GLOBAL_CONFIG_DIR, GLOBAL_CONFIG_FILE);
  const globalRaw = readYamlLike(globalPath);
  if (globalRaw) {
    const validation = validateConfig(globalRaw);
    if (validation.valid) {
      config = mergeConfig(config, globalRaw);
      sources.push("global");
    } else {
      errors.push(...validation.errors.map((e) => `[global] ${e}`));
    }
  }

  if (projectDir) {
    const projectPath = path.join(projectDir, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE);
    const projectRaw = readYamlLike(projectPath);
    if (projectRaw) {
      const validation = validateConfig(projectRaw);
      if (validation.valid) {
        config = mergeConfig(config, projectRaw);
        sources.push("project");
      } else {
        errors.push(...validation.errors.map((e) => `[project] ${e}`));
      }
    }
  }

  config = applyEnvOverrides(config);
  if (sources.length > 1 || hasEnvOverrides()) {
    sources.push("env");
  }

  return { config, sources, errors };
}

export function getConfigValue(config: UndoableConfig, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = config;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setConfigValue(config: UndoableConfig, key: string, value: unknown): UndoableConfig {
  const result = structuredClone(config);
  const parts = key.split(".");
  let current: Record<string, unknown> = result as unknown as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]!] = value;
  return result;
}

function readYamlLike(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8").trim();
    if (!content) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function applyEnvOverrides(config: UndoableConfig): UndoableConfig {
  const result = structuredClone(config);

  if (process.env.UNDOABLE_DAEMON_PORT) {
    const port = parseInt(process.env.UNDOABLE_DAEMON_PORT, 10);
    if (!isNaN(port)) result.daemon.port = port;
  }
  if (process.env.UNDOABLE_DAEMON_HOST) {
    result.daemon.host = process.env.UNDOABLE_DAEMON_HOST;
  }
  if (process.env.UNDOABLE_JWT_SECRET) {
    result.daemon.jwtSecret = process.env.UNDOABLE_JWT_SECRET;
  }
  if (process.env.UNDOABLE_DATABASE_URL) {
    result.database.url = process.env.UNDOABLE_DATABASE_URL;
  }
  if (process.env.UNDOABLE_LOG_LEVEL) {
    result.logging.level = process.env.UNDOABLE_LOG_LEVEL as typeof result.logging.level;
  }

  return result;
}

function hasEnvOverrides(): boolean {
  return !!(
    process.env.UNDOABLE_DAEMON_PORT ||
    process.env.UNDOABLE_DAEMON_HOST ||
    process.env.UNDOABLE_JWT_SECRET ||
    process.env.UNDOABLE_DATABASE_URL ||
    process.env.UNDOABLE_LOG_LEVEL
  );
}
