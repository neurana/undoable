import { Command } from "commander";
import fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const HOME = os.homedir();
const DEFAULT_PORT = 7433;
const PID_FILE = path.join(HOME, ".undoable", "daemon.pid.json");
const PROVIDERS_FILE = path.join(HOME, ".undoable", "providers.json");
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const NC = "\x1b[0m";

function resolveDaemonPort(): number {
  try {
    const raw = fs.readFileSync(PID_FILE, "utf-8").trim();
    if (!raw) return DEFAULT_PORT;
    const parsed = JSON.parse(raw) as { port?: unknown };
    if (typeof parsed.port === "number" && parsed.port > 0 && parsed.port <= 65535) {
      return parsed.port;
    }
    return DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

function hasDirectoryAccess(target: string): boolean {
  try {
    fs.readdirSync(target);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return true;
    return false;
  }
}

function checkAuthState(): { configured: boolean; providersWithKeys: number; envKeys: string[] } {
  const envKeys = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENROUTER_API_KEY",
  ].filter((key) => Boolean(process.env[key]?.trim()));

  let providersWithKeys = 0;
  try {
    const raw = fs.readFileSync(PROVIDERS_FILE, "utf-8").trim();
    if (raw) {
      const parsed = JSON.parse(raw) as {
        providers?: Array<{ apiKey?: unknown; apiKeyEncrypted?: unknown }>;
      };
      providersWithKeys = (parsed.providers ?? []).filter((provider) => {
        const plain = typeof provider.apiKey === "string" && provider.apiKey.trim().length > 0;
        const encrypted = typeof provider.apiKeyEncrypted === "string" && provider.apiKeyEncrypted.trim().length > 0;
        return plain || encrypted;
      }).length;
    }
  } catch {
    // best effort only
  }

  return {
    configured: envKeys.length > 0 || providersWithKeys > 0,
    providersWithKeys,
    envKeys,
  };
}

export function statusCommand(): Command {
  return new Command("status")
    .description("Show Undoable system status and permissions")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const info: Record<string, unknown> = {};
      const daemonPort = resolveDaemonPort();

      info.platform = `${os.type()} ${os.release()} (${os.arch()})`;
      info.node = process.version;
      info.home = HOME;

      let daemonOk = false;
      try {
        const res = await fetch(`http://127.0.0.1:${daemonPort}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) daemonOk = true;
      } catch { }
      info.daemon = daemonOk ? "running" : "stopped";
      info.daemonPort = daemonPort;

      const perms: Record<string, boolean> = {};
      if (process.platform === "darwin") {
        for (const dir of ["Downloads", "Desktop", "Documents"]) {
          perms[dir] = hasDirectoryAccess(path.join(HOME, dir));
        }
      }
      info.permissions = perms;
      info.fullDiskAccess =
        Object.values(perms).length === 0 || Object.values(perms).every(Boolean);

      const auth = checkAuthState();
      info.auth = {
        configured: auth.configured,
        providersWithKeys: auth.providersWithKeys,
        envKeys: auth.envKeys,
      };

      if (opts.json) {
        console.log(JSON.stringify(info, null, 2));
        return;
      }

      console.log("");
      console.log(`${BOLD}  Undoable Status${NC}`);
      console.log("");
      console.log(`  Platform:   ${info.platform}`);
      console.log(`  Node.js:    ${info.node}`);
      console.log(`  Daemon:     ${daemonOk ? GREEN + "running" + NC : RED + "stopped" + NC}`);
      console.log(`  Port:       ${daemonPort}`);
      console.log(
        `  Auth:       ${auth.configured ? GREEN + "configured" + NC : YELLOW + "not set" + NC}`,
      );
      if (auth.providersWithKeys > 0) {
        console.log(`  Providers:  ${auth.providersWithKeys} with saved keys`);
      }

      if (Object.keys(perms).length > 0) {
        console.log("");
        console.log(`${BOLD}  Permissions${NC}`);
        const fdaOk = Object.values(perms).every(Boolean);
        console.log(`  Full Disk:  ${fdaOk ? GREEN + "granted" + NC : RED + "not granted" + NC}`);
        for (const [dir, ok] of Object.entries(perms)) {
          console.log(`    ${ok ? GREEN + "✓" : RED + "✗"} ~/${dir}${NC}`);
        }
        if (!fdaOk) {
          console.log(`\n  ${YELLOW}Run ${BOLD}nrn setup --fix${NC}${YELLOW} to fix permissions${NC}`);
        }
      }
      console.log("");
    });
}
