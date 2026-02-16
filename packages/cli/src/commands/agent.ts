import { Command } from "commander";
import { daemonRequest } from "./daemon-client.js";

type AgentRecord = {
  id: string;
  name: string;
  model: string;
  instructions?: string;
  skills?: string[];
  default?: boolean;
};

function addDaemonOptions<T extends Command>(cmd: T): T {
  return cmd
    .option("--url <url>", "Daemon base URL (default: http://127.0.0.1:7433)")
    .option("--token <token>", "Gateway/daemon bearer token")
    .option("--json", "Output raw JSON", false);
}

export function agentCommand(): Command {
  const cmd = new Command("agent").description("Manage agents");

  addDaemonOptions(
    cmd
      .command("list")
      .description("List configured agents")
      .action(async (opts: { url?: string; token?: string; json?: boolean }) => {
        try {
          const agents = await daemonRequest<AgentRecord[]>("/agents", {
            url: opts.url,
            token: opts.token,
          });
          if (opts.json) {
            console.log(JSON.stringify(agents, null, 2));
            return;
          }
          if (agents.length === 0) {
            console.log("No agents configured.");
            return;
          }
          for (const agent of agents) {
            const marker = agent.default ? "*" : " ";
            console.log(`${marker} ${agent.id}\t${agent.name}\t${agent.model}`);
          }
        } catch (err) {
          console.error(String(err));
          process.exitCode = 1;
        }
      }),
  );

  addDaemonOptions(
    cmd
      .command("status")
      .description("Show agent status")
      .argument("[agentId]", "Agent ID")
      .action(async (agentId: string | undefined, opts: { url?: string; token?: string; json?: boolean }) => {
        try {
          if (!agentId) {
            const agents = await daemonRequest<AgentRecord[]>("/agents", {
              url: opts.url,
              token: opts.token,
            });
            if (opts.json) {
              console.log(JSON.stringify(agents, null, 2));
              return;
            }
            console.log(`Agents: ${agents.length}`);
            for (const agent of agents) {
              console.log(`- ${agent.id}: ${agent.model}${agent.default ? " (default)" : ""}`);
            }
            return;
          }

          const agent = await daemonRequest<AgentRecord>(`/agents/${encodeURIComponent(agentId)}`, {
            url: opts.url,
            token: opts.token,
          });
          if (opts.json) {
            console.log(JSON.stringify(agent, null, 2));
            return;
          }

          console.log(`id: ${agent.id}`);
          console.log(`name: ${agent.name}`);
          console.log(`model: ${agent.model}`);
          console.log(`default: ${agent.default ? "yes" : "no"}`);
          console.log(`skills: ${agent.skills?.length ?? 0}`);
        } catch (err) {
          console.error(String(err));
          process.exitCode = 1;
        }
      }),
  );

  return cmd;
}
