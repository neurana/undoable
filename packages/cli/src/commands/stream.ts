import { Command } from "commander";

export function streamCommand(): Command {
  return new Command("stream")
    .description("Follow a run in real time")
    .argument("<runId>", "Run ID to stream")
    .action(async (runId) => {
      console.log(`Streaming run ${runId}...`);
    });
}
