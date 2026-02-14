import { Command } from "commander";
import { setupCommand } from "./commands/setup.js";
import { startCommand } from "./commands/start.js";
import { statusCommand } from "./commands/status.js";
import { daemonCommand } from "./commands/daemon.js";
import { planCommand } from "./commands/plan.js";
import { shadowCommand } from "./commands/shadow.js";
import { applyCommand } from "./commands/apply.js";
import { undoCommand } from "./commands/undo.js";
import { streamCommand } from "./commands/stream.js";
import { receiptCommand } from "./commands/receipt.js";
import { verifyCommand } from "./commands/verify.js";
import { agentCommand } from "./commands/agent.js";
import { configCommand } from "./commands/config.js";
import { doctorCommand } from "./commands/doctor.js";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("nrn")
    .description("Undoable — safe, verifiable, reversible AI agent runtime")
    .version("0.1.0");

  program.addCommand(setupCommand());
  program.addCommand(startCommand());
  program.addCommand(statusCommand());
  program.addCommand(daemonCommand());
  program.addCommand(planCommand());
  program.addCommand(shadowCommand());
  program.addCommand(applyCommand());
  program.addCommand(undoCommand());
  program.addCommand(streamCommand());
  program.addCommand(receiptCommand());
  program.addCommand(verifyCommand());
  program.addCommand(agentCommand());
  program.addCommand(configCommand());
  program.addCommand(doctorCommand());

  return program;
}
