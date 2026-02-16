export const RUN_STATUSES = [
  "created",
  "planning",
  "planned",
  "shadowing",
  "shadowed",
  "approval_required",
  "applying",
  "applied",
  "undoing",
  "undone",
  "paused",
  "cancelled",
  "failed",
  "completed",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export const PHASES = ["plan", "shadow", "apply", "undo"] as const;

export type Phase = (typeof PHASES)[number];

export type RunSummary = {
  id: string;
  userId: string;
  agentId: string;
  status: RunStatus;
  instruction: string;
  fingerprint?: string;
  engineVersion: string;
  createdAt: string;
  updatedAt: string;
  jobId?: string;
};

export type PlanStep = {
  id: string;
  tool: string;
  intent: string;
  params: Record<string, unknown>;
  capabilities: string[];
  reversible: boolean;
  dependsOn: string[];
  agentId?: string;
};

export type PlanGraph = {
  version: 1;
  instruction: string;
  context: Record<string, unknown>;
  steps: PlanStep[];
  estimatedCapabilities: string[];
  agentId: string;
  subagentSteps?: Array<{
    agentId: string;
    steps: string[];
  }>;
};

export type Receipt = {
  runId: string;
  userId: string;
  agentId: string;
  instruction: string;
  status: RunStatus;
  fingerprint: string;
  engineVersion: string;
  createdAt: string;
  completedAt: string;
  stepsTotal: number;
  stepsCompleted: number;
  stepsFailed: number;
};
