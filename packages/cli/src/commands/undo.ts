import { Command } from "commander";
import { daemonRequest } from "./daemon-client.js";

export function undoCommand(): Command {
  return new Command("undo")
    .description("Rollback applied changes")
    .requiredOption("--run <id>", "Run ID to undo")
    .option("--url <url>", "Daemon base URL (default: http://127.0.0.1:7433)")
    .option("--token <token>", "Gateway/daemon bearer token")
    .option("--json", "Output raw JSON", false)
    .action(async (opts) => {
      try {
        const result = await daemonRequest(`/runs/${encodeURIComponent(String(opts.run))}/undo`, {
          url: opts.url as string | undefined,
          token: opts.token as string | undefined,
          method: "POST",
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`Run ${opts.run} marked as undoing.`);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });
}
