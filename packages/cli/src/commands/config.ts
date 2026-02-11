import { Command } from "commander";
import { loadConfig, getConfigValue, setConfigValue } from "@undoable/core";

export function configCommand(): Command {
  const cmd = new Command("config").description("Manage configuration");

  cmd
    .command("get <key>")
    .description("Get a config value by dot-path (e.g. daemon.port)")
    .action((key: string) => {
      const { config } = loadConfig(process.cwd());
      const value = getConfigValue(config, key);
      if (value === undefined) {
        console.error(`Config key not found: ${key}`);
        process.exitCode = 1;
        return;
      }
      console.log(typeof value === "object" ? JSON.stringify(value, null, 2) : String(value));
    });

  cmd
    .command("list")
    .description("List all config values")
    .action(() => {
      const { config, sources } = loadConfig(process.cwd());
      console.log(JSON.stringify(config, null, 2));
      console.log(`\nSources: ${sources.join(" → ")}`);
    });

  cmd
    .command("set <key> <value>")
    .description("Set a config value (prints updated config, does not persist)")
    .action((key: string, value: string) => {
      const { config } = loadConfig(process.cwd());
      let parsed: unknown = value;
      if (value === "true") parsed = true;
      else if (value === "false") parsed = false;
      else if (/^\d+$/.test(value)) parsed = parseInt(value, 10);

      const updated = setConfigValue(config, key, parsed);
      const result = getConfigValue(updated, key);
      console.log(`${key} = ${typeof result === "object" ? JSON.stringify(result) : String(result)}`);
    });

  return cmd;
}
