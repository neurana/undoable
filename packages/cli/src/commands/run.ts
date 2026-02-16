import { Command } from "commander";
import { daemonRequest } from "./daemon-client.js";

type DaemonOpts = {
  url?: string;
  token?: string;
  json?: boolean;
};

type RunRecord = {
  id: string;
  status: string;
  instruction: string;
  agentId?: string;
  jobId?: string;
  createdAt?: string;
  updatedAt?: string;
};

function withDaemonOptions<T extends Command>(cmd: T): T {
  return cmd
    .option("--url <url>", "Daemon base URL (default: http://127.0.0.1:7433)")
    .option("--token <token>", "Gateway/daemon bearer token")
    .option("--json", "Output raw JSON", false);
}

function printJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

async function runSafe(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
  }
}

export function runCommand(): Command {
  const cmd = new Command("run").description("Create and manage runs from terminal");

  withDaemonOptions(
    cmd.command("create")
      .description("Create and start a run")
      .argument("<instruction>", "Instruction to execute")
      .option("--agent <id>", "Agent ID")
      .action(async (instruction: string, opts: DaemonOpts & { agent?: string }) => {
        await runSafe(async () => {
          const created = await daemonRequest<RunRecord>("/runs", {
            url: opts.url,
            token: opts.token,
            method: "POST",
            body: {
              instruction,
              agentId: opts.agent,
            },
          });

          if (opts.json) {
            printJson(created);
            return;
          }

          console.log(`run ${created.id} created`);
          console.log(`status: ${created.status}`);
          console.log(`agent: ${created.agentId ?? "default"}`);
        });
      }),
  );

  withDaemonOptions(
    cmd.command("list")
      .description("List runs")
      .option("--job <jobId>", "Filter by jobId")
      .action(async (opts: DaemonOpts & { job?: string }) => {
        await runSafe(async () => {
          const path = opts.job
            ? `/runs?${new URLSearchParams({ jobId: opts.job }).toString()}`
            : "/runs";
          const runs = await daemonRequest<RunRecord[]>(path, {
            url: opts.url,
            token: opts.token,
          });

          if (opts.json) {
            printJson(runs);
            return;
          }

          if (runs.length === 0) {
            console.log("No runs found.");
            return;
          }

          for (const run of runs) {
            const shortInstruction = run.instruction.length > 80
              ? `${run.instruction.slice(0, 77)}...`
              : run.instruction;
            console.log(`${run.id}\t${run.status}\t${run.agentId ?? "default"}\t${shortInstruction}`);
          }
        });
      }),
  );

  withDaemonOptions(
    cmd.command("get")
      .description("Get one run")
      .argument("<runId>", "Run ID")
      .action(async (runId: string, opts: DaemonOpts) => {
        await runSafe(async () => {
          const run = await daemonRequest<RunRecord>(`/runs/${encodeURIComponent(runId)}`, {
            url: opts.url,
            token: opts.token,
          });

          if (opts.json) {
            printJson(run);
            return;
          }

          console.log(`id: ${run.id}`);
          console.log(`status: ${run.status}`);
          console.log(`agent: ${run.agentId ?? "default"}`);
          console.log(`created: ${run.createdAt ?? ""}`);
          console.log(`updated: ${run.updatedAt ?? ""}`);
          console.log(`instruction: ${run.instruction}`);
        });
      }),
  );

  withDaemonOptions(
    cmd.command("action")
      .description("Apply an action to a run")
      .argument("<runId>", "Run ID")
      .argument("<action>", "Action: pause|resume|cancel|apply|undo")
      .action(async (runId: string, action: string, opts: DaemonOpts) => {
        await runSafe(async () => {
          const allowed = new Set(["pause", "resume", "cancel", "apply", "undo"]);
          if (!allowed.has(action)) {
            throw new Error(`Unsupported action \"${action}\". Allowed: pause, resume, cancel, apply, undo`);
          }

          const out = await daemonRequest(`/runs/${encodeURIComponent(runId)}/${encodeURIComponent(action)}`, {
            url: opts.url,
            token: opts.token,
            method: "POST",
          });

          if (opts.json) {
            printJson(out);
            return;
          }

          console.log(`run ${runId} action ${action} sent`);
        });
      }),
  );

  withDaemonOptions(
    cmd.command("delete")
      .description("Delete a run")
      .argument("<runId>", "Run ID")
      .action(async (runId: string, opts: DaemonOpts) => {
        await runSafe(async () => {
          const out = await daemonRequest(`/runs/${encodeURIComponent(runId)}`, {
            url: opts.url,
            token: opts.token,
            method: "DELETE",
          });

          if (opts.json) {
            printJson(out);
            return;
          }

          console.log(`run ${runId} deleted`);
        });
      }),
  );

  return cmd;
}
