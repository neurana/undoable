import { Command } from "commander";

export function applyCommand(): Command {
  return new Command("apply")
    .description("Apply shadow changes to real workspace")
    .requiredOption("--run <id>", "Run ID to apply")
    .option("--yes", "Skip approval prompt")
    .action(async (opts) => {
      console.log(`Applying run ${opts.run}...`);
    });
}
