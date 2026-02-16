import { Command } from "commander";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runOnboard } from "./onboard.js";

const HOME = os.homedir();
const TCC_DIRS = ["Downloads", "Desktop", "Documents", "Movies", "Music", "Pictures"];
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const NC = "\x1b[0m";

function checkFDA(): { ok: boolean; details: Record<string, boolean> } {
  if (process.platform !== "darwin") return { ok: true, details: {} };
  const details: Record<string, boolean> = {};
  let allOk = true;
  for (const dir of TCC_DIRS) {
    try {
      const raw = execSync(`ls -1A ${JSON.stringify(path.join(HOME, dir))} 2>/dev/null | wc -l`, {
        encoding: "utf-8", timeout: 3000,
      }).trim();
      const count = Number.parseInt(raw, 10) || 0;
      details[dir] = count > 0;
      if (count === 0) allOk = false;
    } catch {
      details[dir] = false;
      allOk = false;
    }
  }
  return { ok: Object.values(details).some(Boolean) ? allOk : false, details };
}

function ensureConfigDir(): string {
  const dir = path.join(HOME, ".undoable");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function openSystemSettings() {
  if (process.platform !== "darwin") return;
  try {
    execSync('open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles" 2>/dev/null', { timeout: 5000 });
  } catch {
    try {
      execSync('open "x-apple.systempreferences:com.apple.preference.security" 2>/dev/null', { timeout: 5000 });
    } catch { }
  }
}

export function setupCommand(): Command {
  return new Command("setup")
    .description("Initialize Undoable, workspace, and macOS permissions")
    .option("--workspace <dir>", "Agent workspace directory")
    .option("--wizard", "Run onboarding wizard after setup checks", false)
    .option("--non-interactive", "Run onboarding wizard without prompts", false)
    .option("--mode <mode>", "Wizard mode: local|remote", "local")
    .option("--remote-url <url>", "Remote gateway URL (for mode remote)")
    .option("--remote-token <token>", "Remote gateway token (optional)")
    .option("--fix", "Automatically open System Settings to fix permissions")
    .action(async (opts) => {
      console.log("");
      console.log(`${BOLD}  Undoable — Setup${NC}`);
      console.log("");

      console.log(`${BOLD}  1. Full Disk Access${NC}`);
      const fda = checkFDA();
      if (fda.ok) {
        console.log(`     ${GREEN}✓ Granted${NC}`);
      } else {
        console.log(`     ${RED}✗ Not granted${NC}`);
        for (const [dir, ok] of Object.entries(fda.details)) {
          console.log(`       ${ok ? GREEN + "✓" : RED + "✗"} ~/${dir}${NC}`);
        }
        console.log("");
        console.log(`     ${YELLOW}Fix: System Settings → Privacy & Security → Full Disk Access${NC}`);
        console.log(`     ${YELLOW}Enable your terminal app, then restart it.${NC}`);
        if (opts.fix) {
          console.log(`     ${BOLD}Opening System Settings...${NC}`);
          openSystemSettings();
        } else {
          console.log(`     ${YELLOW}Run ${BOLD}nrn setup --fix${NC}${YELLOW} to open System Settings automatically.${NC}`);
        }
      }
      console.log("");

      console.log(`${BOLD}  2. Dependencies${NC}`);
      console.log(`     ${GREEN}✓ Node.js ${process.version}${NC}`);
      try {
        const pnpmV = execSync("pnpm -v", { encoding: "utf-8", timeout: 5000 }).trim();
        console.log(`     ${GREEN}✓ pnpm ${pnpmV}${NC}`);
      } catch {
        console.log(`     ${RED}✗ pnpm not found — install with: npm i -g pnpm${NC}`);
      }
      console.log("");

      console.log(`${BOLD}  3. Environment${NC}`);
      if (process.env.OPENAI_API_KEY) {
        console.log(`     ${GREEN}✓ OPENAI_API_KEY is set${NC}`);
      } else {
        console.log(`     ${YELLOW}⚠ OPENAI_API_KEY not set — export it before running nrn start${NC}`);
      }
      console.log("");

      console.log(`${BOLD}  4. Config${NC}`);
      const configDir = ensureConfigDir();
      console.log(`     ${GREEN}✓ ${configDir}${NC}`);
      console.log("");

      const hasWizardFlags =
        opts.wizard ||
        opts.nonInteractive ||
        opts.mode !== "local" ||
        Boolean(opts.remoteUrl) ||
        Boolean(opts.remoteToken);

      if (hasWizardFlags) {
        try {
          await runOnboard({
            workspace: opts.workspace as string | undefined,
            nonInteractive: Boolean(opts.nonInteractive),
            mode: opts.mode as string | undefined,
            remoteUrl: opts.remoteUrl as string | undefined,
            remoteToken: opts.remoteToken as string | undefined,
          });
        } catch (err) {
          console.log(`  ${RED}${BOLD}✗ Onboarding failed:${NC} ${String(err)}`);
          process.exitCode = 1;
          return;
        }
      }

      if (fda.ok) {
        console.log(`  ${GREEN}${BOLD}✓ Setup complete! Run: nrn start${NC}`);
      } else {
        console.log(`  ${YELLOW}${BOLD}⚠ Setup incomplete — Full Disk Access needed.${NC}`);
        console.log(`  ${YELLOW}  Fix permissions, restart terminal, then run: nrn setup${NC}`);
      }
      if (!hasWizardFlags) {
        console.log(`  ${YELLOW}Tip:${NC} run ${BOLD}nrn setup --wizard${NC} for guided onboarding.`);
      }
      console.log("");

      if (!fda.ok) process.exitCode = 1;
    });
}
