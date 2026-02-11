import { Command } from "commander";

export function userCommand(): Command {
  const cmd = new Command("user").description("Manage users");

  cmd
    .command("create")
    .description("Create a new user")
    .requiredOption("--username <name>", "Username")
    .option("--role <role>", "User role (admin|operator|viewer)", "operator")
    .action(async (opts) => {
      console.log(`Creating user ${opts.username} with role ${opts.role}`);
    });

  cmd
    .command("list")
    .description("List users")
    .action(async () => {
      console.log("Users:");
    });

  cmd
    .command("delete")
    .description("Delete a user")
    .argument("<username>", "Username to delete")
    .action(async (username) => {
      console.log(`Deleting user ${username}`);
    });

  return cmd;
}
