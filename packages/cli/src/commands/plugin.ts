import * as fsp from "node:fs/promises";
import * as path from "node:path";
import os from "node:os";
import { Command } from "commander";
import { daemonRequest } from "./daemon-client.js";

const PLUGINS_DIR = path.join(os.homedir(), ".undoable", "plugins");

type PluginInfo = {
  name: string;
  version: string;
  description: string;
  author?: string;
  active: boolean;
};

function addDaemonOptions<T extends Command>(cmd: T): T {
  return cmd
    .option("--url <url>", "Daemon base URL (default: http://127.0.0.1:7433)")
    .option("--token <token>", "Gateway/daemon bearer token")
    .option("--json", "Output raw JSON", false);
}

export function pluginCommand(): Command {
  const cmd = new Command("plugin").description("Manage plugins");

  addDaemonOptions(
    cmd
      .command("list")
      .description("List installed plugins")
      .action(async (opts: { url?: string; token?: string; json?: boolean }) => {
        try {
          const res = await daemonRequest<{ plugins: PluginInfo[] }>("/plugins", {
            url: opts.url,
            token: opts.token,
          });
          if (opts.json) {
            console.log(JSON.stringify(res.plugins, null, 2));
            return;
          }
          if (res.plugins.length === 0) {
            console.log("No plugins installed.");
            return;
          }
          for (const p of res.plugins) {
            const status = p.active ? "active" : "inactive";
            console.log(`  ${p.name}@${p.version}\t[${status}]\t${p.description}`);
          }
        } catch (err) {
          console.error(String(err));
          process.exitCode = 1;
        }
      }),
  );

  addDaemonOptions(
    cmd
      .command("enable")
      .description("Enable a plugin")
      .argument("<name>", "Plugin name")
      .action(async (name: string, opts: { url?: string; token?: string; json?: boolean }) => {
        try {
          const res = await daemonRequest<{ ok: boolean }>(`/plugins/${encodeURIComponent(name)}/enable`, {
            url: opts.url,
            token: opts.token,
            method: "POST",
          });
          if (opts.json) {
            console.log(JSON.stringify(res, null, 2));
            return;
          }
          console.log(`Plugin "${name}" enabled.`);
        } catch (err) {
          console.error(String(err));
          process.exitCode = 1;
        }
      }),
  );

  addDaemonOptions(
    cmd
      .command("disable")
      .description("Disable a plugin")
      .argument("<name>", "Plugin name")
      .action(async (name: string, opts: { url?: string; token?: string; json?: boolean }) => {
        try {
          const res = await daemonRequest<{ ok: boolean }>(`/plugins/${encodeURIComponent(name)}/disable`, {
            url: opts.url,
            token: opts.token,
            method: "POST",
          });
          if (opts.json) {
            console.log(JSON.stringify(res, null, 2));
            return;
          }
          console.log(`Plugin "${name}" disabled.`);
        } catch (err) {
          console.error(String(err));
          process.exitCode = 1;
        }
      }),
  );

  cmd
    .command("install")
    .description("Install a plugin from a local directory")
    .argument("<path>", "Path to plugin directory")
    .action(async (srcPath: string) => {
      try {
        const resolved = path.resolve(srcPath);
        const manifestPath = path.join(resolved, "plugin.json");
        const raw = await fsp.readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(raw) as { name: string; version: string };
        if (!manifest.name) throw new Error("plugin.json missing 'name' field");

        const dest = path.join(PLUGINS_DIR, manifest.name);
        await fsp.mkdir(PLUGINS_DIR, { recursive: true });
        await fsp.cp(resolved, dest, { recursive: true });
        console.log(`Installed "${manifest.name}@${manifest.version}" to ${dest}`);
        console.log("Restart the daemon to load the plugin.");
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  cmd
    .command("remove")
    .description("Remove an installed plugin")
    .argument("<name>", "Plugin name")
    .action(async (name: string) => {
      try {
        const pluginDir = path.join(PLUGINS_DIR, name);
        await fsp.rm(pluginDir, { recursive: true, force: true });
        console.log(`Removed plugin "${name}".`);
        console.log("Restart the daemon to apply changes.");
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  return cmd;
}
