import { Command } from "commander";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import {
  DEFAULT_WORKSPACE,
  ensureUndoableDir,
  ensureWorkspace,
  writeConfigFile,
  writeProfileFiles,
} from "../wizard/onboarding-helpers.js";
import { runOnboardingWizard, type OnboardOptions } from "../wizard/onboarding.js";
import { WizardCancelledError } from "../wizard/prompts.js";

const UNDOABLE_DIR = path.join(os.homedir(), ".undoable");

export type NonInteractiveOnboardOptions = OnboardOptions & {
  mode?: string;
  remoteUrl?: string;
  remoteToken?: string;
};

export async function runNonInteractiveOnboard(opts: NonInteractiveOnboardOptions) {
  ensureUndoableDir();

  const workspace = opts.workspace?.trim() || DEFAULT_WORKSPACE;
  const mode = opts.mode === "remote" ? "remote" : "local";

  if (mode === "remote" && !opts.remoteUrl) {
    throw new Error("--remote-url is required when --mode remote --non-interactive is used");
  }

  ensureWorkspace(workspace);

  const config: Record<string, unknown> = {
    agents: {
      default: {
        default: true,
        workspace,
        mode,
        ...(mode === "remote" && opts.remoteUrl ? { remoteUrl: opts.remoteUrl } : {}),
        ...(mode === "remote" && opts.remoteToken ? { remoteToken: opts.remoteToken } : {}),
      },
    },
    wizard: {
      lastRunAt: new Date().toISOString(),
      lastRunCommand: "onboard",
      lastRunFlow: "non-interactive",
    },
  };

  writeConfigFile(config);
  writeProfileFiles({
    userName: process.env.USER || "User",
    botName: "Undoable",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    personality: "You are a helpful, concise, and friendly AI assistant with access to powerful tools.",
    instructions: "Personal AI assistant",
  });

  // Auto-enable built-in skills
  const skillsFile = path.join(UNDOABLE_DIR, "skills.json");
  fs.writeFileSync(skillsFile, JSON.stringify({ version: 1, enabled: ["github", "web-search"] }, null, 2) + "\n", "utf-8");

  console.log("\nOnboarding completed");
  console.log(`  Workspace: ${workspace}`);
  console.log(`  Mode: ${mode}`);
  if (mode === "remote" && opts.remoteUrl) {
    console.log(`  Remote URL: ${opts.remoteUrl}`);
  }
  console.log("");
}

export function onboardCommand(): Command {
  return new Command("onboard")
    .description("Interactive wizard to set up Undoable")
    .option("--flow <flow>", "Onboarding flow: quickstart, advanced, or manual")
    .option("--workspace <dir>", "Agent workspace directory")
    .option("--non-interactive", "Run onboarding without prompts", false)
    .option("--accept-risk", "Acknowledge security warning", false)
    .option("--reset", "Reset all config before onboarding", false)
    .option("--mode <mode>", "Wizard mode: local|remote", "local")
    .option("--remote-url <url>", "Remote gateway URL (for mode remote)")
    .option("--remote-token <token>", "Remote gateway token (optional)")
    .action(async (opts) => {
      if (opts.nonInteractive) {
        if (!opts.acceptRisk) {
          throw new Error("--accept-risk is required with --non-interactive");
        }
        await runNonInteractiveOnboard(opts as NonInteractiveOnboardOptions);
        return;
      }

      const prompter = createClackPrompter();
      try {
        await runOnboardingWizard(opts as OnboardOptions, prompter);
      } catch (err) {
        if (err instanceof WizardCancelledError) {
          process.exit(0);
        }
        throw err;
      }
    });
}
