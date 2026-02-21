import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerCliPreActionHooks } from "./preaction.js";

function createProgram(): Command {
  const program = new Command();
  registerCliPreActionHooks(program);
  program
    .command("run")
    .option("--url <url>")
    .option("--token <token>")
    .action(() => {});
  return program;
}

describe("cli pre-action hooks", () => {
  it("rejects remote url override without explicit token", async () => {
    const program = createProgram();
    await expect(
      program.parseAsync(
        ["node", "nrn", "run", "--url", "https://remote.example.com"],
        { from: "node" },
      ),
    ).rejects.toThrow(/requires --token/i);
  });

  it("allows loopback url override without token", async () => {
    const program = createProgram();
    await expect(
      program.parseAsync(
        ["node", "nrn", "run", "--url", "http://127.0.0.1:7433"],
        { from: "node" },
      ),
    ).resolves.not.toThrow();
  });
});

