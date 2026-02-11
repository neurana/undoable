import { Command } from "commander";

export function shadowCommand(): Command {
  return new Command("shadow")
    .description("Plan + execute in isolated shadow workspace")
    .argument("<instruction>", "Task instruction for the agent")
    .option("--llm <provider>", "LLM provider", "openai")
    .option("--model <model>", "Model to use")
    .option("--cwd <dir>", "Working directory", ".")
    .option("--agent <id>", "Agent to use")
    .action(async (instruction, opts) => {
      console.log(`Shadow run: "${instruction}" with ${opts.llm}`);
    });
}
