import type { RunManager } from "../../services/run-manager.js";
import type { SwarmService } from "../../services/swarm-service.js";
import type { AgentTool } from "../types.js";
import { createSwarmNodeTools } from "./node-tools.js";
import { createSwarmWorkflowTools } from "./workflow-tools.js";

export function createSwarmTools(
  swarmService: SwarmService,
  runManager: RunManager,
): AgentTool[] {
  return [
    ...createSwarmWorkflowTools(swarmService),
    ...createSwarmNodeTools(swarmService, runManager),
  ];
}
