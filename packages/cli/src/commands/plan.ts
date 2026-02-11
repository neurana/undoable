import { Command } from "commander";

export function planCommand(): Command {
  return new Command("plan")
    .description("Generate a plan (read-only, no writes)")
    .argument("<instruction>", "Task instruction for the agent")
    .option("--llm <provider>", "LLM provider", "openai")
    .option("--model <model>", "Model to use")
    .option("--cwd <dir>", "Working directory", ".")
    .action(async (instruction, opts) => {
      console.log(`Planning: "${instruction}" with ${opts.llm}`);
    });
}
