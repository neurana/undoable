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

export function verifyCommand(): Command {
  return new Command("verify")
    .description("Verify run fingerprint integrity")
    .argument("<runId>", "Run ID to verify")
    .option("--expected <sha256>", "Expected SHA-256 fingerprint")
    .option("--url <url>", "Daemon base URL (default: http://127.0.0.1:7433)")
    .option("--token <token>", "Gateway/daemon bearer token")
    .option("--json", "Output raw JSON", false)
    .action(async (runId, opts) => {
      try {
        const run = await daemonRequest<RunRecord>(`/runs/${encodeURIComponent(String(runId))}`, {
          url: opts.url as string | undefined,
          token: opts.token as string | undefined,
        });

        const fingerprint = buildRunFingerprint(run);
        const expected = typeof opts.expected === "string" ? opts.expected.trim().toLowerCase() : "";
        const ok = expected ? fingerprint.toLowerCase() === expected : true;

        if (opts.json) {
          console.log(JSON.stringify({ runId: run.id, fingerprint, expected: expected || undefined, ok }, null, 2));
        } else {
          console.log(`run: ${run.id}`);
          console.log(`fingerprint: ${fingerprint}`);
          if (expected) {
            console.log(`expected: ${expected}`);
            console.log(`match: ${ok ? "yes" : "no"}`);
          }
        }

        if (!ok) process.exitCode = 1;
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });
}
