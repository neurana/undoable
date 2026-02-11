import type { RunStatus, Phase } from "@undoable/shared";

export type CheckpointData = {
  runId: string;
  status: RunStatus;
  currentPhase?: Phase;
  completedStepIds: string[];
  failedStepIds: string[];
  stepResults: Record<string, { success: boolean; output?: string; error?: string }>;
  metadata: Record<string, unknown>;
  savedAt: string;
};
