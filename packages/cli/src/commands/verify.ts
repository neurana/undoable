import { Command } from "commander";

export function verifyCommand(): Command {
  return new Command("verify")
    .description("Verify run fingerprint integrity")
    .argument("<runId>", "Run ID to verify")
    .action(async (runId) => {
      console.log(`Verifying fingerprint for ${runId}...`);
    });
}
