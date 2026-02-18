import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const ROOT_DIR = path.resolve(import.meta.dirname, "../../../..");
const CLI_ENTRY = path.join(ROOT_DIR, "packages/cli/src/index.ts");
const TSX_LOADER = path.join(ROOT_DIR, "node_modules/tsx/dist/loader.mjs");

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function runCli(
  args: string[],
  opts: { homeDir: string; cwd?: string },
): SpawnSyncReturns<string> {
  return spawnSync("node", ["--import", TSX_LOADER, CLI_ENTRY, ...args], {
    cwd: opts.cwd ?? ROOT_DIR,
    env: {
      ...process.env,
      HOME: opts.homeDir,
    },
    encoding: "utf-8",
  });
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("nrn CLI integration", () => {
  it("persists global config values via config set", () => {
    const homeDir = makeTempDir("undoable-cli-home-");

    const setResult = runCli(["config", "set", "daemon.port", "8123"], {
      homeDir,
    });
    expect(setResult.status).toBe(0);

    const configPath = path.join(homeDir, ".undoable", "config.yaml");
    const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
      daemon?: { port?: number };
    };
    expect(rawConfig.daemon?.port).toBe(8123);

    const getResult = runCli(["config", "get", "daemon.port"], { homeDir });
    expect(getResult.status).toBe(0);
    expect(getResult.stdout.trim()).toBe("8123");
  });

  it("persists project-scoped config when --project is used", () => {
    const homeDir = makeTempDir("undoable-cli-home-");
    const projectDir = makeTempDir("undoable-cli-project-");

    const result = runCli(
      ["config", "set", "logging.level", "\"debug\"", "--project"],
      { homeDir, cwd: projectDir },
    );
    expect(result.status).toBe(0);

    const projectConfigPath = path.join(
      projectDir,
      ".undoable",
      "config.yaml",
    );
    const raw = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8")) as {
      logging?: { level?: string };
    };
    expect(raw.logging?.level).toBe("debug");
  });

  it("rejects invalid scope combinations and invalid config values", () => {
    const homeDir = makeTempDir("undoable-cli-home-");

    const badScope = runCli(
      ["config", "set", "daemon.port", "8123", "--project", "--global"],
      { homeDir },
    );
    expect(badScope.status).toBe(1);
    expect(badScope.stderr).toContain(
      "Choose only one scope: --project or --global",
    );

    const badValue = runCli(["config", "set", "daemon.port", "70000"], {
      homeDir,
    });
    expect(badValue.status).toBe(1);
    expect(badValue.stderr).toContain("Config validation failed");
  });

  it("requires --accept-risk for non-interactive onboard", () => {
    const homeDir = makeTempDir("undoable-cli-home-");
    const result = runCli(["onboard", "--non-interactive"], { homeDir });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "--accept-risk is required with --non-interactive",
    );
  });

  it("quickstart bootstraps local config with defaults", () => {
    const homeDir = makeTempDir("undoable-cli-home-");
    const workspaceDir = path.join(homeDir, "workspace-quick");

    const result = runCli(
      ["quickstart", "--yes", "--no-start", "--workspace", workspaceDir],
      { homeDir },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Quickstart complete");

    const configPath = path.join(homeDir, ".undoable", "config.yaml");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
      agents?: {
        default?: {
          workspace?: string;
          mode?: string;
        };
      };
    };
    expect(config.agents?.default?.workspace).toBe(workspaceDir);
    expect(config.agents?.default?.mode).toBe("local");

    const skillsPath = path.join(homeDir, ".undoable", "skills.json");
    const skills = JSON.parse(fs.readFileSync(skillsPath, "utf-8")) as {
      enabled?: string[];
    };
    expect(skills.enabled).toContain("github");
    expect(skills.enabled).toContain("web-search");
  });

  it("quickstart in remote mode requires remote url", () => {
    const homeDir = makeTempDir("undoable-cli-home-");
    const result = runCli(
      ["quickstart", "--yes", "--no-start", "--mode", "remote"],
      { homeDir },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "--remote-url is required when --mode remote --non-interactive is used",
    );
  });

  it("status uses daemon pid state port instead of hardcoded default", { timeout: 15000 }, () => {
    const homeDir = makeTempDir("undoable-cli-home-");
    const undoableDir = path.join(homeDir, ".undoable");
    fs.mkdirSync(undoableDir, { recursive: true });
    const port = 65530;

    fs.writeFileSync(
      path.join(undoableDir, "daemon.pid.json"),
      `${JSON.stringify({ pid: process.pid, port, startedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf-8",
    );

    const result = runCli(["status", "--json"], { homeDir });
    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout) as {
      daemon?: string;
      daemonPort?: number;
    };
    expect(json.daemonPort).toBe(port);
    expect(json.daemon).toBe("stopped");
  });
});
