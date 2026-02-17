import { Command } from "commander";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import { runOnboardingWizard } from "../wizard/onboarding.js";
import { WizardCancelledError } from "../wizard/prompts.js";

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

function checkApiKeys(): string[] {
  const found: string[] = [];
  if (process.env.OPENAI_API_KEY) found.push("OPENAI_API_KEY");
  if (process.env.ANTHROPIC_API_KEY) found.push("ANTHROPIC_API_KEY");
  if (process.env.GOOGLE_API_KEY) found.push("GOOGLE_API_KEY");
  if (process.env.DEEPSEEK_API_KEY) found.push("DEEPSEEK_API_KEY");
  return found;
}

export function setupCommand(): Command {
  return new Command("setup")
    .description("Initialize Undoable, check permissions, and run onboarding")
    .option("--workspace <dir>", "Agent workspace directory")
    .option("--flow <flow>", "Onboarding flow: quickstart or manual")
    .option("--non-interactive", "Run onboarding without prompts", false)
    .option("--accept-risk", "Acknowledge security warning", false)
    .option("--fix", "Automatically open System Settings to fix permissions")
    .option("--skip-onboard", "Skip onboarding wizard after checks", false)
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
        console.log(`     ${YELLOW}Fix: System Settings > Privacy & Security > Full Disk Access${NC}`);
        console.log(`     ${YELLOW}Enable your terminal app, then restart it.${NC}`);
        if (opts.fix) {
          console.log(`     ${BOLD}Opening System Settings...${NC}`);
          openSystemSettings();
        } else {
          console.log(`     ${YELLOW}Run ${BOLD}nrn setup --fix${NC}${YELLOW} to open automatically.${NC}`);
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
      try {
        execSync("docker --version", { encoding: "utf-8", timeout: 5000 });
        console.log(`     ${GREEN}✓ Docker available${NC}`);
      } catch {
        console.log(`     ${YELLOW}⚠ Docker not found (optional, needed for sandbox mode)${NC}`);
      }
      console.log("");

      console.log(`${BOLD}  3. API Keys${NC}`);
      const apiKeys = checkApiKeys();
      if (apiKeys.length > 0) {
        for (const key of apiKeys) {
          console.log(`     ${GREEN}✓ ${key}${NC}`);
        }
      } else {
        console.log(`     ${YELLOW}⚠ No API keys found in environment${NC}`);
        console.log(`     ${YELLOW}  The onboarding wizard can help you configure a provider.${NC}`);
      }
      console.log("");

      console.log(`${BOLD}  4. Config${NC}`);
      const configDir = ensureConfigDir();
      console.log(`     ${GREEN}✓ ${configDir}${NC}`);
      console.log("");

      if (opts.skipOnboard) {
        if (fda.ok) {
          console.log(`  ${GREEN}${BOLD}✓ Setup complete! Run: nrn start${NC}`);
        } else {
          console.log(`  ${YELLOW}${BOLD}⚠ Setup incomplete — Full Disk Access needed.${NC}`);
        }
        console.log("");
        if (!fda.ok) process.exitCode = 1;
        return;
      }

      const prompter = createClackPrompter();
      try {
        await runOnboardingWizard({
          workspace: opts.workspace as string | undefined,
          flow: opts.flow as string | undefined,
          acceptRisk: Boolean(opts.acceptRisk),
        }, prompter);
      } catch (err) {
        if (err instanceof WizardCancelledError) {
          process.exit(0);
        }
        console.log(`  ${RED}${BOLD}✗ Onboarding failed:${NC} ${String(err)}`);
        process.exitCode = 1;
      }
    });
}
