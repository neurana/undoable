import { Command } from "commander";
import { daemonRequest } from "./daemon-client.js";

type DaemonOpts = {
  url?: string;
  token?: string;
  json?: boolean;
};

type SwarmWorkflowSummary = {
  id: string;
  name: string;
  enabled: boolean;
  nodes?: unknown[];
  edges?: unknown[];
};

function addDaemonOptions<T extends Command>(cmd: T): T {
  return cmd
    .option("--url <url>", "Daemon base URL (default: http://127.0.0.1:7433)")
    .option("--token <token>", "Gateway/daemon bearer token")
    .option("--json", "Output raw JSON", false);
}

function print(data: unknown, asJson?: boolean) {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (typeof data === "string") {
    console.log(data);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

function parseSkillRefs(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const refs = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return refs.length > 0 ? refs : undefined;
}

function resolveEnabledFlag(opts: { enabled?: boolean; disabled?: boolean }): boolean | undefined {
  if (opts.enabled) return true;
  if (opts.disabled) return false;
  return undefined;
}

async function withHandler(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
  }
}

export function swarmCommand(): Command {
  const cmd = new Command("swarm").description("Manage SWARM workflows and nodes from terminal");

  addDaemonOptions(
    cmd.command("list")
      .description("List SWARM workflows")
      .action(async (opts: DaemonOpts) => {
        await withHandler(async () => {
          const workflows = await daemonRequest<SwarmWorkflowSummary[]>("/swarm/workflows", {
            url: opts.url,
            token: opts.token,
          });
          if (opts.json) {
            print(workflows, true);
            return;
          }

          if (workflows.length === 0) {
            console.log("No SWARM workflows found.");
            return;
          }

          for (const wf of workflows) {
            console.log(
              `${wf.id}\t${wf.name}\t${wf.enabled ? "live" : "paused"}\tnodes:${wf.nodes?.length ?? 0}\tedges:${wf.edges?.length ?? 0}`,
            );
          }
        });
      }),
  );

  addDaemonOptions(
    cmd.command("get")
      .description("Get one SWARM workflow")
      .argument("<workflowId>", "Workflow id")
      .action(async (workflowId: string, opts: DaemonOpts) => {
        await withHandler(async () => {
          const workflow = await daemonRequest(`/swarm/workflows/${encodeURIComponent(workflowId)}`, {
            url: opts.url,
            token: opts.token,
          });
          print(workflow, opts.json);
        });
      }),
  );

  addDaemonOptions(
    cmd.command("create")
      .description("Create a SWARM workflow")
      .requiredOption("--name <name>", "Workflow name")
      .option("--description <text>", "Workflow description")
      .option("--orchestrator <id>", "Orchestrator agent id")
      .option("--disabled", "Create disabled workflow", false)
      .action(async (opts: DaemonOpts & { name: string; description?: string; orchestrator?: string; disabled?: boolean }) => {
        await withHandler(async () => {
          const created = await daemonRequest("/swarm/workflows", {
            url: opts.url,
            token: opts.token,
            method: "POST",
            body: {
              name: opts.name,
              description: opts.description,
              orchestratorAgentId: opts.orchestrator,
              enabled: !opts.disabled,
            },
          });
          print(created, opts.json);
        });
      }),
  );

  addDaemonOptions(
    cmd.command("enable")
      .description("Enable a workflow")
      .argument("<workflowId>", "Workflow id")
      .action(async (workflowId: string, opts: DaemonOpts) => {
        await withHandler(async () => {
          const updated = await daemonRequest(`/swarm/workflows/${encodeURIComponent(workflowId)}`, {
            url: opts.url,
            token: opts.token,
            method: "PATCH",
            body: { enabled: true },
          });
          print(updated, opts.json);
        });
      }),
  );

  addDaemonOptions(
    cmd.command("disable")
      .description("Disable a workflow")
      .argument("<workflowId>", "Workflow id")
      .action(async (workflowId: string, opts: DaemonOpts) => {
        await withHandler(async () => {
          const updated = await daemonRequest(`/swarm/workflows/${encodeURIComponent(workflowId)}`, {
            url: opts.url,
            token: opts.token,
            method: "PATCH",
            body: { enabled: false },
          });
          print(updated, opts.json);
        });
      }),
  );

  addDaemonOptions(
    cmd.command("delete")
      .description("Delete a workflow")
      .argument("<workflowId>", "Workflow id")
      .action(async (workflowId: string, opts: DaemonOpts) => {
        await withHandler(async () => {
          const out = await daemonRequest(`/swarm/workflows/${encodeURIComponent(workflowId)}`, {
            url: opts.url,
            token: opts.token,
            method: "DELETE",
          });
          print(out, opts.json);
        });
      }),
  );

  addDaemonOptions(
    cmd.command("add-node")
      .description("Add a node to workflow")
      .argument("<workflowId>", "Workflow id")
      .requiredOption("--name <name>", "Node name")
      .option("--type <type>", "Node type", "agent_task")
      .option("--prompt <text>", "Node prompt")
      .option("--agent <id>", "Agent id")
      .option("--skills <refs>", "Comma separated skill refs")
      .option("--enabled", "Set enabled=true")
      .option("--disabled", "Set enabled=false")
      .action(async (
        workflowId: string,
        opts: DaemonOpts & {
          name: string;
          type?: string;
          prompt?: string;
          agent?: string;
          skills?: string;
          enabled?: boolean;
          disabled?: boolean;
        },
      ) => {
        await withHandler(async () => {
          const created = await daemonRequest(`/swarm/workflows/${encodeURIComponent(workflowId)}/nodes`, {
            url: opts.url,
            token: opts.token,
            method: "POST",
            body: {
              name: opts.name,
              type: opts.type,
              prompt: opts.prompt,
              agentId: opts.agent,
              skillRefs: parseSkillRefs(opts.skills),
              enabled: resolveEnabledFlag(opts),
            },
          });
          print(created, opts.json);
        });
      }),
  );

  addDaemonOptions(
    cmd.command("update-node")
      .description("Update a workflow node")
      .argument("<workflowId>", "Workflow id")
      .argument("<nodeId>", "Node id")
      .option("--name <name>", "Node name")
      .option("--type <type>", "Node type")
      .option("--prompt <text>", "Node prompt")
      .option("--agent <id>", "Agent id")
      .option("--skills <refs>", "Comma separated skill refs")
      .option("--enabled", "Set enabled=true")
      .option("--disabled", "Set enabled=false")
      .action(async (
        workflowId: string,
        nodeId: string,
        opts: DaemonOpts & {
          name?: string;
          type?: string;
          prompt?: string;
          agent?: string;
          skills?: string;
          enabled?: boolean;
          disabled?: boolean;
        },
      ) => {
        await withHandler(async () => {
          const patch: Record<string, unknown> = {
            name: opts.name,
            type: opts.type,
            prompt: opts.prompt,
            agentId: opts.agent,
            skillRefs: parseSkillRefs(opts.skills),
            enabled: resolveEnabledFlag(opts),
          };
          const updated = await daemonRequest(
            `/swarm/workflows/${encodeURIComponent(workflowId)}/nodes/${encodeURIComponent(nodeId)}`,
            {
              url: opts.url,
              token: opts.token,
              method: "PATCH",
              body: patch,
            },
          );
          print(updated, opts.json);
        });
      }),
  );

  addDaemonOptions(
    cmd.command("delete-node")
      .description("Delete a workflow node")
      .argument("<workflowId>", "Workflow id")
      .argument("<nodeId>", "Node id")
      .action(async (workflowId: string, nodeId: string, opts: DaemonOpts) => {
        await withHandler(async () => {
          const out = await daemonRequest(
            `/swarm/workflows/${encodeURIComponent(workflowId)}/nodes/${encodeURIComponent(nodeId)}`,
            {
              url: opts.url,
              token: opts.token,
              method: "DELETE",
            },
          );
          print(out, opts.json);
        });
      }),
  );

  addDaemonOptions(
    cmd.command("link")
      .description("Create/update an edge between nodes")
      .argument("<workflowId>", "Workflow id")
      .requiredOption("--from <nodeId>", "From node id")
      .requiredOption("--to <nodeId>", "To node id")
      .option("--condition <expr>", "Optional edge condition")
      .action(async (
        workflowId: string,
        opts: DaemonOpts & { from: string; to: string; condition?: string },
      ) => {
        await withHandler(async () => {
          const out = await daemonRequest(`/swarm/workflows/${encodeURIComponent(workflowId)}/edges`, {
            url: opts.url,
            token: opts.token,
            method: "POST",
            body: { from: opts.from, to: opts.to, condition: opts.condition },
          });
          print(out, opts.json);
        });
      }),
  );

  addDaemonOptions(
    cmd.command("unlink")
      .description("Remove an edge between nodes")
      .argument("<workflowId>", "Workflow id")
      .requiredOption("--from <nodeId>", "From node id")
      .requiredOption("--to <nodeId>", "To node id")
      .action(async (workflowId: string, opts: DaemonOpts & { from: string; to: string }) => {
        await withHandler(async () => {
          const query = new URLSearchParams({ from: opts.from, to: opts.to }).toString();
          const out = await daemonRequest(`/swarm/workflows/${encodeURIComponent(workflowId)}/edges?${query}`, {
            url: opts.url,
            token: opts.token,
            method: "DELETE",
          });
          print(out, opts.json);
        });
      }),
  );

  addDaemonOptions(
    cmd.command("runs")
      .description("List runs for one SWARM node")
      .argument("<workflowId>", "Workflow id")
      .argument("<nodeId>", "Node id")
      .action(async (workflowId: string, nodeId: string, opts: DaemonOpts) => {
        await withHandler(async () => {
          const out = await daemonRequest(
            `/swarm/workflows/${encodeURIComponent(workflowId)}/nodes/${encodeURIComponent(nodeId)}/runs`,
            {
              url: opts.url,
              token: opts.token,
            },
          );
          print(out, opts.json);
        });
      }),
  );

  return cmd;
}
