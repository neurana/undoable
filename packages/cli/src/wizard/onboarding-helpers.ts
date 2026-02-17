import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const HOME = os.homedir();
export const UNDOABLE_DIR = path.join(HOME, ".undoable");
export const CONFIG_FILE = path.join(UNDOABLE_DIR, "config.yaml");
export const PROVIDERS_FILE = path.join(UNDOABLE_DIR, "providers.json");
export const CHANNELS_FILE = path.join(UNDOABLE_DIR, "channels.json");
export const SKILLS_FILE = path.join(UNDOABLE_DIR, "skills.json");
export const DEFAULT_WORKSPACE = path.join(UNDOABLE_DIR, "workspace");
export const DEFAULT_PORT = 7433;

export type OnboardConfig = Record<string, unknown>;

export type ConfigSnapshot = {
  exists: boolean;
  valid: boolean;
  config: OnboardConfig;
};

export function printWizardHeader() {
  const header = [
    "",
    "  ██╗   ██╗███╗   ██╗██████╗  ██████╗  █████╗ ██████╗ ██╗     ███████╗",
    "  ██║   ██║████╗  ██║██╔══██╗██╔═══██╗██╔══██╗██╔══██╗██║     ██╔════╝",
    "  ██║   ██║██╔██╗ ██║██║  ██║██║   ██║███████║██████╔╝██║     █████╗  ",
    "  ██║   ██║██║╚██╗██║██║  ██║██║   ██║██╔══██║██╔══██╗██║     ██╔══╝  ",
    "  ╚██████╔╝██║ ╚████║██████╔╝╚██████╔╝██║  ██║██████╔╝███████╗███████╗",
    "   ╚═════╝ ╚═╝  ╚═══╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝",
    "",
    "            Swarm AI that actually executes",
    "",
  ].join("\n");
  console.log(header);
}

export function ensureUndoableDir() {
  fs.mkdirSync(UNDOABLE_DIR, { recursive: true });
}

export function readConfigSnapshot(): ConfigSnapshot {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return { exists: false, valid: true, config: {} };
    }
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8").trim();
    if (!raw) return { exists: true, valid: true, config: {} };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { exists: true, valid: true, config: parsed as OnboardConfig };
    }
    return { exists: true, valid: false, config: {} };
  } catch {
    return { exists: true, valid: false, config: {} };
  }
}

export function writeConfigFile(config: OnboardConfig) {
  ensureUndoableDir();
  fs.writeFileSync(
    CONFIG_FILE,
    `${JSON.stringify(config, null, 2)}\n`,
    "utf-8",
  );
}

export function summarizeExistingConfig(config: OnboardConfig): string {
  const rows: string[] = [];
  const agents = config.agents as Record<string, unknown> | undefined;
  const defaultAgent = agents?.default as Record<string, unknown> | undefined;
  if (defaultAgent?.workspace)
    rows.push(`workspace: ${defaultAgent.workspace}`);
  if (defaultAgent?.mode) rows.push(`mode: ${defaultAgent.mode}`);
  if (config.daemon) {
    const daemon = config.daemon as Record<string, unknown>;
    if (daemon.port) rows.push(`port: ${daemon.port}`);
  }
  return rows.length ? rows.join("\n") : "No key settings detected.";
}

export function handleReset(scope: "config" | "config+creds" | "full") {
  const remove = (p: string) => {
    try {
      fs.rmSync(p, { recursive: true });
    } catch {
      /* ignore */
    }
  };

  remove(CONFIG_FILE);
  remove(PROVIDERS_FILE);

  if (scope === "config+creds" || scope === "full") {
    remove(CHANNELS_FILE);
    remove(SKILLS_FILE);
    remove(path.join(UNDOABLE_DIR, "SOUL.md"));
    remove(path.join(UNDOABLE_DIR, "USER.md"));
    remove(path.join(UNDOABLE_DIR, "IDENTITY.md"));
  }

  if (scope === "full") {
    remove(DEFAULT_WORKSPACE);
  }
}

export function ensureWorkspace(workspace: string) {
  fs.mkdirSync(workspace, { recursive: true });
}

export function writeProfileFiles(profile: {
  userName: string;
  botName: string;
  timezone: string;
  personality: string;
  instructions: string;
}) {
  ensureUndoableDir();

  const soul = ["# SOUL.md", "", profile.personality, ""].join("\n");

  const user = [
    "# USER.md",
    "",
    `- **Name:** ${profile.userName}`,
    `- **Timezone:** ${profile.timezone}`,
    "",
  ].join("\n");

  const identity = [
    "# IDENTITY.md",
    "",
    `- **Name:** ${profile.botName}`,
    "- **Role:** Personal AI assistant",
    `- **Instructions:** ${profile.instructions}`,
    "- **Platform:** Undoable",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(UNDOABLE_DIR, "SOUL.md"), soul, "utf-8");
  fs.writeFileSync(path.join(UNDOABLE_DIR, "USER.md"), user, "utf-8");
  fs.writeFileSync(path.join(UNDOABLE_DIR, "IDENTITY.md"), identity, "utf-8");
}

export function shortenHome(p: string): string {
  return p.startsWith(HOME) ? `~${p.slice(HOME.length)}` : p;
}
