import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type OnboardMode = "local" | "remote";

type OnboardOptions = {
  workspace?: string;
  nonInteractive?: boolean;
  mode?: string;
  remoteUrl?: string;
  remoteToken?: string;
};

const HOME = os.homedir();
const UNDOABLE_DIR = path.join(HOME, ".undoable");
const CONFIG_FILE = path.join(UNDOABLE_DIR, "config.yaml");
const DEFAULT_WORKSPACE = path.join(UNDOABLE_DIR, "workspace");

function ensureUndoableDir() {
  if (!fs.existsSync(UNDOABLE_DIR)) {
    fs.mkdirSync(UNDOABLE_DIR, { recursive: true });
  }
}

function normalizeMode(value: string | undefined): OnboardMode {
  return value === "remote" ? "remote" : "local";
}

function readConfigFile(): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore parse/missing errors, fall back to empty config
  }
  return {};
}

function writeConfigFile(config: Record<string, unknown>) {
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function updateConfig(opts: { workspace: string; mode: OnboardMode; remoteUrl?: string; remoteToken?: string }) {
  const cfg = readConfigFile();
  const agents = isRecord(cfg.agents) ? cfg.agents : {};
  const defaultAgent = isRecord(agents.default) ? agents.default : {};

  const nextDefault: Record<string, unknown> = {
    ...defaultAgent,
    default: true,
    workspace: opts.workspace,
    mode: opts.mode,
  };

  if (opts.mode === "remote") {
    if (opts.remoteUrl) nextDefault.remoteUrl = opts.remoteUrl;
    if (opts.remoteToken) nextDefault.remoteToken = opts.remoteToken;
  }

  const next = {
    ...cfg,
    agents: {
      ...agents,
      default: nextDefault,
    },
  };

  writeConfigFile(next);
}

function writeOnboardingFiles(profile: {
  userName: string;
  botName: string;
  timezone: string;
  personality: string;
  instructions: string;
}) {
  const soulContent = [
    "# SOUL.md — Bot Identity",
    "",
    profile.personality,
    "",
  ].join("\n");

  const userContent = [
    "# USER.md — User Profile",
    "",
    `- **Name:** ${profile.userName}`,
    `- **Timezone:** ${profile.timezone}`,
    "",
  ].join("\n");

  const identityContent = [
    "# IDENTITY.md — Bot Identity",
    "",
    `- **Name:** ${profile.botName}`,
    "- **Role:** Personal AI assistant",
    `- **Instructions:** ${profile.instructions}`,
    "- **Platform:** Undoable",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(UNDOABLE_DIR, "SOUL.md"), soulContent, "utf-8");
  fs.writeFileSync(path.join(UNDOABLE_DIR, "USER.md"), userContent, "utf-8");
  fs.writeFileSync(path.join(UNDOABLE_DIR, "IDENTITY.md"), identityContent, "utf-8");
}

async function askWithDefault(prompt: string, defaultValue: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(`${prompt} (${defaultValue}): `)).trim();
    return answer || defaultValue;
  } finally {
    rl.close();
  }
}

export async function runOnboard(options: OnboardOptions) {
  ensureUndoableDir();

  const mode = normalizeMode(options.mode);
  const workspace = options.workspace?.trim() || DEFAULT_WORKSPACE;
  const timezoneDefault = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const defaults = {
    userName: process.env.USER || "User",
    botName: "Undoable",
    timezone: timezoneDefault,
    personality: "You are a helpful, concise, and friendly AI assistant.",
    instructions: "Personal AI assistant",
  };

  let userName = defaults.userName;
  let botName = defaults.botName;
  let timezone = defaults.timezone;
  let personality = defaults.personality;
  let instructions = defaults.instructions;
  let remoteUrl = options.remoteUrl?.trim() || "";
  let remoteToken = options.remoteToken?.trim() || "";

  if (!options.nonInteractive) {
    console.log("\nUndoable onboarding wizard\n");
    userName = await askWithDefault("Your name", defaults.userName);
    botName = await askWithDefault("Assistant name", defaults.botName);
    timezone = await askWithDefault("Timezone", defaults.timezone);
    personality = await askWithDefault("Assistant personality", defaults.personality);
    instructions = await askWithDefault("Assistant instructions", defaults.instructions);
    if (mode === "remote") {
      remoteUrl = await askWithDefault("Remote gateway URL", remoteUrl || "ws://127.0.0.1:7433/ws");
      remoteToken = await askWithDefault("Remote gateway token (optional)", remoteToken || "");
    }
  } else if (mode === "remote" && !remoteUrl) {
    throw new Error("--remote-url is required when --mode remote --non-interactive is used");
  }

  fs.mkdirSync(workspace, { recursive: true });
  updateConfig({
    workspace,
    mode,
    remoteUrl: remoteUrl || undefined,
    remoteToken: remoteToken || undefined,
  });
  writeOnboardingFiles({ userName, botName, timezone, personality, instructions });

  console.log("\n✓ Onboarding completed");
  console.log(`  Workspace: ${workspace}`);
  console.log(`  Mode: ${mode}`);
  if (mode === "remote") {
    console.log(`  Remote URL: ${remoteUrl}`);
  }
  console.log("");
}

export function onboardCommand(): Command {
  return new Command("onboard")
    .description("Interactive wizard to set up workspace and assistant profile")
    .option("--workspace <dir>", "Agent workspace directory")
    .option("--non-interactive", "Run onboarding without prompts", false)
    .option("--mode <mode>", "Wizard mode: local|remote", "local")
    .option("--remote-url <url>", "Remote gateway URL (for mode remote)")
    .option("--remote-token <token>", "Remote gateway token (optional)")
    .action(async (opts) => {
      await runOnboard(opts as OnboardOptions);
    });
}
