import { Command } from "commander";
import { setupCommand } from "./commands/setup.js";
import { onboardCommand } from "./commands/onboard.js";
import { startCommand } from "./commands/start.js";
import { statusCommand } from "./commands/status.js";
import { daemonCommand } from "./commands/daemon.js";
import { planCommand } from "./commands/plan.js";
import { shadowCommand } from "./commands/shadow.js";
import { applyCommand } from "./commands/apply.js";
import { undoCommand } from "./commands/undo.js";
import { streamCommand } from "./commands/stream.js";
import { runCommand } from "./commands/run.js";
import { receiptCommand } from "./commands/receipt.js";
import { verifyCommand } from "./commands/verify.js";
import { agentCommand } from "./commands/agent.js";
import { configCommand } from "./commands/config.js";
import { doctorCommand } from "./commands/doctor.js";
import { swarmCommand } from "./commands/swarm.js";
import { chatCommand } from "./commands/chat.js";
import { pluginCommand } from "./commands/plugin.js";
import { quickstartCommand } from "./commands/quickstart.js";
import { channelsCommand } from "./commands/channels.js";
import { pairingCommand } from "./commands/pairing.js";
import { settingsCommand } from "./commands/settings.js";
import { registerCliPreActionHooks } from "./preaction.js";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("nrn")
    .description("UNDOABLE — Swarm AI that actually executes")
    .version("0.1.0");

  registerCliPreActionHooks(program);

  program.addCommand(setupCommand());
  program.addCommand(quickstartCommand());
  program.addCommand(onboardCommand());
  program.addCommand(startCommand());
  program.addCommand(statusCommand());
  program.addCommand(daemonCommand());
  program.addCommand(planCommand());
  program.addCommand(shadowCommand());
  program.addCommand(runCommand());
  program.addCommand(applyCommand());
  program.addCommand(undoCommand());
  program.addCommand(streamCommand());
  program.addCommand(receiptCommand());
  program.addCommand(verifyCommand());
  program.addCommand(swarmCommand());
  program.addCommand(agentCommand());
  program.addCommand(chatCommand());
  program.addCommand(channelsCommand());
  program.addCommand(pairingCommand());
  program.addCommand(configCommand());
  program.addCommand(settingsCommand());
  program.addCommand(pluginCommand());
  program.addCommand(doctorCommand());

  return program;
}
