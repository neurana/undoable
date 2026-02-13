import { Command } from "commander";
import { execSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";

const HOME = os.homedir();
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const NC = "\x1b[0m";

export function statusCommand(): Command {
  return new Command("status")
    .description("Show Undoable system status and permissions")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const info: Record<string, unknown> = {};

      info.platform = `${os.type()} ${os.release()} (${os.arch()})`;
      info.node = process.version;
      info.home = HOME;

      let daemonOk = false;
      try {
        const res = await fetch("http://127.0.0.1:7433/health", { signal: AbortSignal.timeout(2000) });
        if (res.ok) daemonOk = true;
      } catch { }
      info.daemon = daemonOk ? "running" : "stopped";

      const perms: Record<string, boolean> = {};
      if (process.platform === "darwin") {
        for (const dir of ["Downloads", "Desktop", "Documents"]) {
          try {
            const raw = execSync(`ls -1A ${JSON.stringify(path.join(HOME, dir))} 2>/dev/null | wc -l`, {
              encoding: "utf-8", timeout: 3000,
            }).trim();
            perms[dir] = (Number.parseInt(raw, 10) || 0) > 0;
          } catch {
            perms[dir] = false;
          }
        }
      }
      info.permissions = perms;
      info.fullDiskAccess = Object.values(perms).length === 0 || Object.values(perms).some(Boolean);

      info.apiKey = process.env.OPENAI_API_KEY ? "set" : "not set";

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
      console.log(`  API Key:    ${process.env.OPENAI_API_KEY ? GREEN + "set" + NC : YELLOW + "not set" + NC}`);

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
