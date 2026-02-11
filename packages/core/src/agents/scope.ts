import path from "node:path";
import type { AgentConfig } from "@undoable/shared";

const DEFAULT_STATE_DIR = ".undoable";

export function resolveAgentWorkspaceDir(agent: AgentConfig, baseDir: string): string {
  return path.join(baseDir, DEFAULT_STATE_DIR, "workspaces", agent.id);
}

export function resolveAgentSessionDir(agent: AgentConfig, baseDir: string): string {
  return path.join(baseDir, DEFAULT_STATE_DIR, "sessions", agent.id);
}

export function resolveAgentArtifactsDir(_agent: AgentConfig, runId: string, baseDir: string): string {
  return path.join(baseDir, DEFAULT_STATE_DIR, "artifacts", runId);
}

export function resolveShadowDir(runId: string, baseDir: string): string {
  return path.join(baseDir, DEFAULT_STATE_DIR, "shadow", runId, "workspace");
}
