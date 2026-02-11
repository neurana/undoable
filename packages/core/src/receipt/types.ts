import type { PlanGraph, RunStatus } from "@undoable/shared";

export type ReceiptInput = {
  runId: string;
  userId: string;
  agentId: string;
  instruction: string;
  plan: PlanGraph;
  status: RunStatus;
  fingerprint: string;
  engineVersion: string;
  createdAt: string;
  completedAt: string;
  stepResults: StepResultSummary[];
  capabilities: string[];
  diffHash?: string;
};

export type StepResultSummary = {
  stepId: string;
  tool: string;
  intent: string;
  success: boolean;
  error?: string;
};

export type ReceiptFormat = "json" | "md";
