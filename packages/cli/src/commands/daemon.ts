import { Command } from "commander";

export function daemonCommand(): Command {
  const cmd = new Command("daemon").description("Manage the nrn-agentd daemon");

  cmd
    .command("start")
    .description("Start the daemon")
    .option("-p, --port <port>", "Port to listen on", "7433")
    .action(async (opts) => {
      console.log(`Starting daemon on port ${opts.port}...`);
    });

  cmd
    .command("stop")
    .description("Stop the daemon")
    .action(async () => {
      console.log("Stopping daemon...");
    });

  cmd
    .command("status")
    .description("Show daemon status")
    .action(async () => {
      console.log("Daemon status: checking...");
    });

  return cmd;
}
