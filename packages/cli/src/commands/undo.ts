import { Command } from "commander";

export function undoCommand(): Command {
  return new Command("undo")
    .description("Rollback applied changes")
    .requiredOption("--run <id>", "Run ID to undo")
    .action(async (opts) => {
      console.log(`Undoing run ${opts.run}...`);
    });
}
