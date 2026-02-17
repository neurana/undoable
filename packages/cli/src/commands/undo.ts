import { Command } from "commander";
import { daemonRequest } from "./daemon-client.js";

type UndoResult = {
  actionId: string;
  toolName: string;
  success: boolean;
  error?: string;
  note?: string;
};

type UndoListResponse = {
  undoable: { id: string; tool: string; args: Record<string, unknown>; startedAt: string }[];
  redoable: { id: string; tool: string; args: Record<string, unknown>; startedAt: string }[];
};

export function undoCommand(): Command {
  const cmd = new Command("undo")
    .description("Undo actions or rollback runs")
    .option("--url <url>", "Daemon base URL (default: http://127.0.0.1:7433)")
    .option("--token <token>", "Gateway/daemon bearer token")
    .option("--json", "Output raw JSON", false);

  cmd
    .command("list")
    .description("List undoable and redoable actions")
    .action(async () => {
      const opts = cmd.opts();
      try {
        const result = await daemonRequest<UndoListResponse>("/chat/undo", {
          url: opts.url,
          token: opts.token,
          method: "POST",
          body: { action: "list" },
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log("\nUndoable actions:");
        if (result.undoable.length === 0) {
          console.log("  (none)");
        } else {
          for (const a of result.undoable) {
            const path = a.args.path ?? a.args.command ?? "";
            console.log(`  ${a.id.slice(0, 8)} | ${a.tool} | ${path}`);
          }
        }
        console.log("\nRedoable actions:");
        if (result.redoable.length === 0) {
          console.log("  (none)");
        } else {
          for (const a of result.redoable) {
            const path = a.args.path ?? a.args.command ?? "";
            console.log(`  ${a.id.slice(0, 8)} | ${a.tool} | ${path}`);
          }
        }
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  cmd
    .command("last [count]")
    .description("Undo the last N actions (default: 1)")
    .action(async (count?: string) => {
      const opts = cmd.opts();
      try {
        const n = count ? parseInt(count, 10) : 1;
        const result = await daemonRequest<{ results: UndoResult[] }>("/chat/undo", {
          url: opts.url,
          token: opts.token,
          method: "POST",
          body: { action: "last", count: n },
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        for (const r of result.results) {
          if (r.success) {
            console.log(`✓ Undid ${r.toolName} (${r.actionId.slice(0, 8)})${r.note ? ` - ${r.note}` : ""}`);
          } else {
            console.log(`✗ Failed to undo ${r.toolName}: ${r.error}`);
          }
        }
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  cmd
    .command("all")
    .description("Undo all actions in current session")
    .action(async () => {
      const opts = cmd.opts();
      try {
        const result = await daemonRequest<{ results: UndoResult[] }>("/chat/undo", {
          url: opts.url,
          token: opts.token,
          method: "POST",
          body: { action: "all" },
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        const success = result.results.filter((r) => r.success).length;
        const failed = result.results.filter((r) => !r.success).length;
        console.log(`Undid ${success} action(s)${failed > 0 ? `, ${failed} failed` : ""}`);
        for (const r of result.results) {
          if (r.success) {
            console.log(`  ✓ ${r.toolName}${r.note ? ` - ${r.note}` : ""}`);
          } else {
            console.log(`  ✗ ${r.toolName}: ${r.error}`);
          }
        }
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  cmd
    .command("one <id>")
    .description("Undo a specific action by ID")
    .action(async (id: string) => {
      const opts = cmd.opts();
      try {
        const result = await daemonRequest<{ result: UndoResult }>("/chat/undo", {
          url: opts.url,
          token: opts.token,
          method: "POST",
          body: { action: "one", id },
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        const r = result.result;
        if (r.success) {
          console.log(`✓ Undid ${r.toolName}${r.note ? ` - ${r.note}` : ""}`);
        } else {
          console.log(`✗ Failed to undo: ${r.error}`);
        }
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  cmd
    .command("run <runId>")
    .description("Undo changes from a specific run")
    .action(async (runId: string) => {
      const opts = cmd.opts();
      try {
        const result = await daemonRequest(`/runs/${encodeURIComponent(runId)}/undo`, {
          url: opts.url,
          token: opts.token,
          method: "POST",
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(`Run ${runId} marked as undoing.`);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  return cmd;
}
