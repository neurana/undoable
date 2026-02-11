import type { Phase, PlanGraph, RunStatus } from "@undoable/shared";

export type EngineRunContext = {
  runId: string;
  userId: string;
  agentId: string;
  instruction: string;
  plan?: PlanGraph;
  workingDir: string;
  shadowDir?: string;
  status: RunStatus;
  currentPhase?: Phase;
  checkpointData?: unknown;
};

export type PhaseResult = {
  success: boolean;
  error?: string;
  artifacts?: string[];
};

export type EngineConfig = {
  engineVersion: string;
  shadowStrategy: "local-copy" | "docker";
  defaultTimeout: number;
};
