export const EVENT_TYPES = [
  "RUN_CREATED",
  "STATUS_CHANGED",
  "RUN_CANCELLED",
  "PHASE_STARTED",
  "PHASE_FINISHED",
  "CAPABILITY_REQUESTED",
  "CAPABILITY_GRANTED",
  "ACTION_STARTED",
  "ACTION_PROGRESS",
  "ACTION_FINISHED",
  "TOOL_STDOUT",
  "TOOL_STDERR",
  "DIFF_READY",
  "APPROVAL_REQUIRED",
  "RUN_PAUSED",
  "RUN_RESUMED",
  "RUN_FAILED",
  "RUN_COMPLETED",
  "LLM_TOKEN",
  "SUBAGENT_SPAWNED",
  "SUBAGENT_COMPLETED",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type EventEnvelope = {
  eventId: number;
  runId: string;
  ts: string;
  type: EventType;
  userId?: string;
  payload?: unknown;
  payloadRef?: string;
};
