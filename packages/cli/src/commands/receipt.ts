import { Command } from "commander";
import { daemonRequest } from "./daemon-client.js";
import { buildRunFingerprint } from "./run-fingerprint.js";

type RunRecord = {
  id: string;
  status: string;
  instruction: string;
  agentId?: string;
  jobId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function receiptCommand(): Command {
  return new Command("receipt")
    .description("View run receipt")
    .argument("<runId>", "Run ID")
    .option("--format <format>", "Output format (md|json)", "md")
    .option("--url <url>", "Daemon base URL (default: http://127.0.0.1:7433)")
    .option("--token <token>", "Gateway/daemon bearer token")
    .action(async (runId, opts) => {
      try {
        const run = await daemonRequest<RunRecord>(`/runs/${encodeURIComponent(String(runId))}`, {
          url: opts.url as string | undefined,
          token: opts.token as string | undefined,
        });
        const fingerprint = buildRunFingerprint(run);

        if ((opts.format as string) === "json") {
          console.log(JSON.stringify({ run, fingerprint }, null, 2));
          return;
        }

        console.log(`# Run Receipt: ${run.id}`);
        console.log("");
        console.log(`- Status: ${run.status}`);
        console.log(`- Agent: ${run.agentId ?? "default"}`);
        console.log(`- Job: ${run.jobId ?? "n/a"}`);
        console.log(`- Created: ${run.createdAt ?? ""}`);
        console.log(`- Updated: ${run.updatedAt ?? ""}`);
        console.log(`- Fingerprint (sha256): ${fingerprint}`);
        console.log("");
        console.log("## Instruction");
        console.log(run.instruction);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });
}
