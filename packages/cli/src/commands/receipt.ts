import { Command } from "commander";

export function receiptCommand(): Command {
  return new Command("receipt")
    .description("View run receipt")
    .argument("<runId>", "Run ID")
    .option("--format <format>", "Output format (md|json)", "md")
    .action(async (runId, opts) => {
      console.log(`Receipt for ${runId} (${opts.format})`);
    });
}
