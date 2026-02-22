import { Command } from "commander";
import { spawn } from "node:child_process";
import fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const NC = "\x1b[0m";
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

type LaunchSpec = {
  command: string;
  args: string[];
  requiresTsx: boolean;
};

function hasTsxLoader(rootDir: string): boolean {
  return fs.existsSync(path.join(rootDir, "node_modules", "tsx", "dist", "loader.mjs"));
}

function resolveDaemonLaunch(rootDir: string): LaunchSpec {
  const daemonDist = path.join(rootDir, "dist", "daemon", "index.mjs");
  if (fs.existsSync(daemonDist)) {
    return { command: "node", args: [daemonDist], requiresTsx: false };
  }
  const daemonEntry = path.join(rootDir, "packages", "daemon", "src", "index.ts");
  return { command: "node", args: ["--import", "tsx", daemonEntry], requiresTsx: true };
}

function resolveViteBin(rootDir: string): string | null {
  const binName = process.platform === "win32" ? "vite.cmd" : "vite";
  const viteBin = path.join(rootDir, "node_modules", ".bin", binName);
  return fs.existsSync(viteBin) ? viteBin : null;
}

export function startCommand(): Command {
  return new Command("start")
    .description("Start the Undoable daemon and UI")
    .option("-p, --port <port>", "Daemon port", "7433")
    .option("--ui-port <port>", "UI dev server port", "5173")
    .option("--no-ui", "Start daemon only, no UI")
    .option("--mode <mode>", "Run mode: interactive|autonomous|supervised", "interactive")
    .option("--max-iterations <n>", "Max tool loop iterations per request")
    .option("--economy", "Enable economy mode for lower token usage")
    .option("--dangerously-skip-permissions", "Skip all permission checks (autonomous mode)")
    .action((opts) => {
      const rootDir = path.resolve(MODULE_DIR, "../../../..");
      const uiDir = path.join(rootDir, "ui");
      const daemonLaunch = resolveDaemonLaunch(rootDir);
      const tsxAvailable = hasTsxLoader(rootDir);
      if (daemonLaunch.requiresTsx && !tsxAvailable) {
        console.error("Could not start daemon: tsx loader is missing.");
        console.error(`Run: pnpm -C "${rootDir}" install`);
        process.exit(1);
      }

      const children: ReturnType<typeof spawn>[] = [];
      let shuttingDown = false;

      const stopChildren = () => {
        for (const child of children) {
          if (!child.killed) {
            try {
              child.kill("SIGTERM");
            } catch {
              // best effort
            }
          }
        }
      };

      const shutdown = (code = 0) => {
        if (shuttingDown) return;
        shuttingDown = true;
        stopChildren();
        process.exit(code);
      };

      process.on("SIGINT", () => shutdown(130));
      process.on("SIGTERM", () => shutdown(143));

      const daemonEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        NRN_PORT: String(opts.port),
      };
      if (opts.mode) daemonEnv.UNDOABLE_RUN_MODE = opts.mode;
      if (opts.maxIterations) daemonEnv.UNDOABLE_MAX_ITERATIONS = opts.maxIterations;
      if (opts.economy) daemonEnv.UNDOABLE_ECONOMY_MODE = "1";
      if (opts.dangerouslySkipPermissions) daemonEnv.UNDOABLE_DANGEROUSLY_SKIP_PERMISSIONS = "1";

      const daemonProc = spawn(daemonLaunch.command, daemonLaunch.args, {
        cwd: rootDir,
        stdio: "inherit",
        env: daemonEnv,
      });
      children.push(daemonProc);

      if (opts.ui !== false) {
        const viteBin = resolveViteBin(rootDir);
        if (!viteBin) {
          console.error("Could not start UI: local Vite binary is missing.");
          console.error(`Run: pnpm -C "${rootDir}" install`);
          shutdown(1);
          return;
        }
        const viteProc = spawn(
          viteBin,
          ["--port", opts.uiPort, "--config", path.join(uiDir, "vite.config.ts"), uiDir],
          {
            cwd: rootDir,
            stdio: "inherit",
            env: process.env,
          },
        );
        children.push(viteProc);

        viteProc.on("error", (err) => {
          if (shuttingDown) return;
          console.error(`Failed to start UI process: ${String(err)}`);
          shutdown(1);
        });

        viteProc.on("exit", (code) => {
          if (shuttingDown) return;
          if (code !== 0 && code !== null) {
            console.error(`UI exited with code ${code}`);
          }
          shutdown(code ?? 0);
        });
      }

      daemonProc.on("error", (err) => {
        if (shuttingDown) return;
        console.error(`Failed to start daemon process: ${String(err)}`);
        shutdown(1);
      });

      console.log("");
      console.log(`${BOLD}====================================${NC}`);
      const modeLabel = opts.dangerouslySkipPermissions ? "autonomous (skip-permissions)" : opts.mode;
      console.log(`${GREEN}${BOLD}  Undoable is running${NC}`);
      console.log(`  Mode:   ${modeLabel}`);
      console.log(`  Economy:${opts.economy ? " on" : " off"}`);
      if (opts.ui !== false) {
        console.log(`  UI:     http://localhost:${opts.uiPort}`);
      }
      console.log(`  API:    http://localhost:${opts.port}`);
      console.log(`${BOLD}====================================${NC}`);
      console.log("  Press Ctrl+C to stop");
      console.log("");

      daemonProc.on("exit", (code) => {
        if (shuttingDown) return;
        if (code !== 0 && code !== null) {
          console.error(`Daemon exited with code ${code}`);
        }
        shutdown(code ?? 0);
      });
    });
}
