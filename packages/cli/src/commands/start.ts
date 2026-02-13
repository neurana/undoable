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
    .option("--dangerously-skip-permissions", "Skip all permission checks (autonomous mode)")
    .action((opts) => {
      const rootDir = path.resolve(import.meta.dirname, "../../../..");
      const daemonEntry = path.join(rootDir, "packages/daemon/src/index.ts");
      const uiDir = path.join(rootDir, "ui");

      const children: ReturnType<typeof spawn>[] = [];

      const cleanup = () => {
        for (const child of children) {
          if (!child.killed) child.kill("SIGTERM");
        }
        process.exit(0);
      };
      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);

      const daemonEnv: Record<string, string> = { ...process.env as Record<string, string>, PORT: opts.port };
      if (opts.mode) daemonEnv.UNDOABLE_RUN_MODE = opts.mode;
      if (opts.maxIterations) daemonEnv.UNDOABLE_MAX_ITERATIONS = opts.maxIterations;
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
      }

      console.log("");
      console.log(`${BOLD}====================================${NC}`);
      const modeLabel = opts.dangerouslySkipPermissions ? "autonomous (skip-permissions)" : opts.mode;
      console.log(`${GREEN}${BOLD}  Undoable is running${NC}`);
      console.log(`  Mode:   ${modeLabel}`);
      if (opts.ui !== false) {
        console.log(`  UI:     http://localhost:${opts.uiPort}`);
      }
      console.log(`  API:    http://localhost:${opts.port}`);
      console.log(`${BOLD}====================================${NC}`);
      console.log("  Press Ctrl+C to stop");
      console.log("");

      daemonProc.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          console.error(`Daemon exited with code ${code}`);
        }
        cleanup();
      });
    });
}
