import { Command } from "commander";
import path from "node:path";
import { daemonRequest } from "./daemon-client.js";

type PlanOptions = {
  llm?: string;
  model?: string;
  cwd?: string;
  agent?: string;
  url?: string;
  token?: string;
  json?: boolean;
};

type RunRecord = {
  id: string;
  status: string;
  instruction: string;
  agentId?: string;
  createdAt?: string;
};

function buildPlanInstruction(rawInstruction: string, opts: PlanOptions): string {
  const cwd = path.resolve(String(opts.cwd ?? "."));
  const lines = [
    "[mode: plan]",
    "Produce a read-only execution plan only.",
    "Do not apply or mutate files/tools beyond planning output.",
    `Working directory: ${cwd}`,
  ];

  if (opts.llm) lines.push(`Preferred provider: ${opts.llm}`);
  if (opts.model) lines.push(`Preferred model: ${opts.model}`);

  lines.push("Task:", rawInstruction);
  return lines.join("\n");
}

export function planCommand(): Command {
  return new Command("plan")
    .description("Generate a plan (read-only, no writes)")
    .argument("<instruction>", "Task instruction for the agent")
    .option("--llm <provider>", "LLM provider", "openai")
    .option("--model <model>", "Model to use")
    .option("--cwd <dir>", "Working directory", ".")
    .option("--agent <id>", "Agent to use")
    .option("--url <url>", "Daemon base URL (default: http://127.0.0.1:7433)")
    .option("--token <token>", "Gateway/daemon bearer token")
    .option("--json", "Output raw JSON", false)
    .action(async (instruction: string, opts: PlanOptions) => {
      try {
        const runInstruction = buildPlanInstruction(instruction, opts);
        const created = await daemonRequest<RunRecord>("/runs", {
          url: opts.url,
          token: opts.token,
          method: "POST",
          body: {
            instruction: runInstruction,
            agentId: opts.agent,
          },
        });

        if (opts.json) {
          console.log(JSON.stringify(created, null, 2));
          return;
        }

        console.log(`Plan run created: ${created.id}`);
        console.log(`status: ${created.status}`);
        console.log(`agent: ${created.agentId ?? "default"}`);
        console.log(`next: nrn stream ${created.id}`);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });
}
