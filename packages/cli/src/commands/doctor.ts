import { Command } from "commander";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig } from "@undoable/core";

type CheckResult = { name: string; ok: boolean; detail: string };

export function doctorCommand(): Command {
  return new Command("doctor")
    .description("Diagnose your Undoable setup")
    .action(() => {
      const checks = runChecks();
      const passed = checks.filter((c) => c.ok).length;
      const failed = checks.filter((c) => !c.ok).length;

      for (const check of checks) {
        const icon = check.ok ? "✓" : "✗";
        console.log(`  ${icon} ${check.name}: ${check.detail}`);
      }

      console.log(`\n${passed} passed, ${failed} failed`);
      if (failed > 0) process.exitCode = 1;
    });
}

function runChecks(): CheckResult[] {
  return [
    checkNode(),
    checkDocker(),
    checkGit(),
    checkConfig(),
    checkConfigDir(),
  ];
}

function checkNode(): CheckResult {
  try {
    const version = process.version;
    const major = parseInt(version.slice(1), 10);
    return { name: "Node.js", ok: major >= 22, detail: `${version} (need >= 22)` };
  } catch {
    return { name: "Node.js", ok: false, detail: "not found" };
  }
}

function checkDocker(): CheckResult {
  try {
    const version = execFileSync("docker", ["--version"], { encoding: "utf-8", timeout: 5000 }).trim();
    return { name: "Docker", ok: true, detail: version };
  } catch {
    return { name: "Docker", ok: false, detail: "not found or not running" };
  }
}

function checkGit(): CheckResult {
  try {
    const version = execFileSync("git", ["--version"], { encoding: "utf-8", timeout: 5000 }).trim();
    return { name: "Git", ok: true, detail: version };
  } catch {
    return { name: "Git", ok: false, detail: "not found" };
  }
}

function checkConfig(): CheckResult {
  const { config, errors } = loadConfig(process.cwd());
  if (errors.length > 0) {
    return { name: "Config", ok: false, detail: errors.join("; ") };
  }
  return { name: "Config", ok: true, detail: `port=${config.daemon.port}, provider=${config.llm.defaultProvider}` };
}

function checkConfigDir(): CheckResult {
  const dir = path.join(os.homedir(), ".undoable");
  if (fs.existsSync(dir)) {
    return { name: "Config dir", ok: true, detail: dir };
  }
  return { name: "Config dir", ok: false, detail: `${dir} does not exist (optional)` };
}
