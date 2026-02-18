import { Command } from "commander";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import { runNonInteractiveOnboard } from "./onboard.js";

type QuickstartOptions = {
  workspace?: string;
  mode?: string;
  remoteUrl?: string;
  remoteToken?: string;
  start?: boolean;
  port?: string;
  yes?: boolean;
  acceptRisk?: boolean;
};
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function normalizeMode(raw: string | undefined): "local" | "remote" {
  const mode = raw?.trim().toLowerCase() ?? "local";
  if (mode === "local" || mode === "remote") return mode;
  throw new Error(`Invalid mode "${raw}". Use local or remote.`);
}

function parsePort(raw: string | undefined): number {
  const value = raw?.trim() || "7433";
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port "${value}".`);
  }
  return parsed;
}

async function resolveRiskAck(opts: QuickstartOptions): Promise<boolean> {
  if (opts.acceptRisk || opts.yes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("--accept-risk or --yes is required in non-interactive terminals");
  }

  const prompter = createClackPrompter();
  await prompter.note(
    [
      "Undoable can run commands, edit files, and access the network.",
      "Use sandboxing and approvals for sensitive workflows.",
    ].join("\n"),
    "Security",
  );
  const ok = await prompter.confirm({
    message: "I understand this is powerful and risky. Continue quickstart?",
    initialValue: false,
  });
  return ok;
}

function startDaemon(port: number) {
  const rootDir = path.resolve(MODULE_DIR, "../../../..");
  const cliEntry = path.join(rootDir, "packages/cli/src/index.ts");
  const result = spawnSync(
    "node",
    ["--import", "tsx", cliEntry, "daemon", "start", "--port", String(port)],
    {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    throw new Error(`daemon start failed with exit code ${result.status ?? 1}`);
  }
}

export function quickstartCommand(): Command {
  return new Command("quickstart")
    .description("One-command bootstrap with sensible defaults")
    .option("--workspace <dir>", "Agent workspace directory")
    .option("--mode <mode>", "Bootstrap mode: local|remote", "local")
    .option("--remote-url <url>", "Remote gateway URL (required for mode remote)")
    .option("--remote-token <token>", "Remote gateway token (optional)")
    .option("--port <port>", "Daemon port when auto-starting locally", "7433")
    .option("--no-start", "Skip starting daemon after bootstrap")
    .option("--accept-risk", "Acknowledge security risk", false)
    .option("--yes", "Skip confirmation prompt", false)
    .action(async (opts: QuickstartOptions) => {
      try {
        const accepted = await resolveRiskAck(opts);
        if (!accepted) {
          console.log("Quickstart cancelled.");
          process.exitCode = 1;
          return;
        }

        const mode = normalizeMode(opts.mode);
        const port = parsePort(opts.port);

        await runNonInteractiveOnboard({
          workspace: opts.workspace,
          mode,
          remoteUrl: opts.remoteUrl,
          remoteToken: opts.remoteToken,
          acceptRisk: true,
          flow: "quickstart",
          nonInteractive: true,
        });

        if (opts.start !== false && mode === "local") {
          startDaemon(port);
          console.log(`Quickstart complete. Open http://127.0.0.1:${port} and run: nrn chat`);
          return;
        }

        if (mode === "remote") {
          console.log("Quickstart complete (remote mode). Use: nrn chat --url <remote-url>");
          return;
        }

        console.log("Quickstart complete. Start daemon with: nrn daemon start");
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });
}
