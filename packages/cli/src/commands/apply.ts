import { Command } from "commander";
import { daemonRequest } from "./daemon-client.js";

export function applyCommand(): Command {
  return new Command("apply")
    .description("Apply shadow changes to real workspace")
    .requiredOption("--run <id>", "Run ID to apply")
    .option("--url <url>", "Daemon base URL (default: http://127.0.0.1:7433)")
    .option("--token <token>", "Gateway/daemon bearer token")
    .option("--json", "Output raw JSON", false)
    .option("--yes", "Skip approval prompt")
    .action(async (opts) => {
      try {
        const result = await daemonRequest(`/runs/${encodeURIComponent(String(opts.run))}/apply`, {
          url: opts.url as string | undefined,
          token: opts.token as string | undefined,
          method: "POST",
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`Run ${opts.run} marked as applying.`);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });
}
