import os from "node:os";
import path from "node:path";

export const DEFAULT_ORCHESTRATOR_AGENT = "default";
export const DEFAULT_STATE_FILE = path.join(os.homedir(), ".undoable", "swarm-workflows.json");
export const DEFAULT_WORKFLOW_ROOT = path.join(os.homedir(), ".undoable", "swarm");
