import { Command } from "commander";

export function agentCommand(): Command {
  const cmd = new Command("agent").description("Manage agents");

  cmd
    .command("list")
    .description("List configured agents")
    .action(async () => {
      console.log("Agents:");
    });

  cmd
    .command("status")
    .description("Show agent status")
    .argument("[agentId]", "Agent ID")
    .action(async (agentId) => {
      console.log(`Agent status: ${agentId ?? "all"}`);
    });

  return cmd;
}
