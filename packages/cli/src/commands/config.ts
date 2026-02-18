import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, getConfigValue, validateConfig } from "@undoable/core";

const GLOBAL_CONFIG_PATH = path.join(os.homedir(), ".undoable", "config.yaml");
const PROJECT_CONFIG_PATH = path.join(process.cwd(), ".undoable", "config.yaml");

type ConfigScope = "global" | "project";

function parseCliValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

function readRawConfigFile(filePath: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("config root must be an object");
  } catch (err) {
    throw new Error(`Cannot read config at ${filePath}: ${String(err)}`);
  }
}

function setAtDotPath(
  input: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const parts = key.split(".").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Invalid config key");
  }

  const out = structuredClone(input);
  let current: Record<string, unknown> = out;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const next = current[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
  return out;
}

function resolveScopePath(scope: ConfigScope): string {
  return scope === "project" ? PROJECT_CONFIG_PATH : GLOBAL_CONFIG_PATH;
}

function writeRawConfigFile(filePath: string, config: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export function configCommand(): Command {
  const cmd = new Command("config").description("Manage configuration");

  cmd
    .command("get <key>")
    .description("Get a config value by dot-path (e.g. daemon.port)")
    .action((key: string) => {
      const { config } = loadConfig(process.cwd());
      const value = getConfigValue(config, key);
      if (value === undefined) {
        console.error(`Config key not found: ${key}`);
        process.exitCode = 1;
        return;
      }
      console.log(typeof value === "object" ? JSON.stringify(value, null, 2) : String(value));
    });

  cmd
    .command("list")
    .description("List all config values")
    .action(() => {
      const { config, sources } = loadConfig(process.cwd());
      console.log(JSON.stringify(config, null, 2));
      console.log(`\nSources: ${sources.join(" → ")}`);
    });

  cmd
    .command("set <key> <value>")
    .description("Set and persist a config value by dot-path")
    .option("--project", "Write to ./.undoable/config.yaml")
    .option("--global", "Write to ~/.undoable/config.yaml (default)")
    .action((key: string, value: string, opts: { project?: boolean; global?: boolean }) => {
      const useProject = Boolean(opts.project);
      const useGlobal = Boolean(opts.global);
      if (useProject && useGlobal) {
        console.error("Choose only one scope: --project or --global");
        process.exitCode = 1;
        return;
      }

      const scope: ConfigScope = useProject ? "project" : "global";
      const targetPath = resolveScopePath(scope);
      const parsed = parseCliValue(value);

      const raw = readRawConfigFile(targetPath);
      const updatedRaw = setAtDotPath(raw, key, parsed);
      const validation = validateConfig(updatedRaw);
      if (!validation.valid) {
        console.error(`Config validation failed: ${validation.errors.join("; ")}`);
        process.exitCode = 1;
        return;
      }

      writeRawConfigFile(targetPath, updatedRaw);

      const { config } = loadConfig(process.cwd());
      const result = getConfigValue(config, key);
      console.log(
        `${key} = ${typeof result === "object" ? JSON.stringify(result) : String(result)}`,
      );
      console.log(`Saved to ${targetPath}`);
    });

  return cmd;
}
