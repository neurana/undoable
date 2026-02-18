import { Command } from "commander";
import { spawn } from "node:child_process";
import * as path from "node:path";

const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const NC = "\x1b[0m";

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
      const rootDir = path.resolve(import.meta.dirname, "../../../..");
      const daemonEntry = path.join(rootDir, "packages/daemon/src/index.ts");
      const uiDir = path.join(rootDir, "ui");

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

      const daemonProc = spawn("node", ["--import", "tsx", daemonEntry], {
        cwd: rootDir,
        stdio: "inherit",
        env: daemonEnv,
      });
      children.push(daemonProc);

      if (opts.ui !== false) {
        const viteProc = spawn("npx", ["vite", "--port", opts.uiPort], {
          cwd: uiDir,
          stdio: "inherit",
          env: process.env,
        });
        children.push(viteProc);

        viteProc.on("exit", (code) => {
          if (shuttingDown) return;
          if (code !== 0 && code !== null) {
            console.error(`UI exited with code ${code}`);
          }
          shutdown(code ?? 0);
        });
      }

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
