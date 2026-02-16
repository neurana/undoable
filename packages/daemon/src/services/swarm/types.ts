import type { SchedulerService } from "@undoable/core";

export type SwarmNodeType =
  | "trigger"
  | "agent_task"
  | "skill_builder"
  | "integration_task"
  | "router"
  | "approval_gate";

export type SwarmNodeSchedule =
  | { mode: "manual" }
  | { mode: "dependency" }
  | { mode: "every"; everyMs: number; anchorMs?: number }
  | { mode: "at"; at: string }
  | { mode: "cron"; expr: string; tz?: string };

export type SwarmNodeScheduleInput =
  | { mode?: "manual" | "dependency" }
  | { mode: "every"; everyMs?: number; everySeconds?: number; anchorMs?: number }
  | { mode: "at"; at: string }
  | { mode: "cron"; expr: string; tz?: string };

export type SwarmEdge = {
  from: string;
  to: string;
  condition?: string;
};

export type SwarmWorkflowNode = {
  id: string;
  name: string;
  type: SwarmNodeType;
  prompt?: string;
  agentId?: string;
  skillRefs: string[];
  config?: Record<string, unknown>;
  schedule: SwarmNodeSchedule;
  enabled: boolean;
  jobId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SwarmWorkflow = {
  id: string;
  name: string;
  description?: string;
  orchestratorAgentId: string;
  enabled: boolean;
  version: number;
  nodes: SwarmWorkflowNode[];
  edges: SwarmEdge[];
  createdAt: string;
  updatedAt: string;
};

export type CreateSwarmWorkflowInput = {
  id?: string;
  name: string;
  description?: string;
  orchestratorAgentId?: string;
  enabled?: boolean;
  nodes?: CreateSwarmNodeInput[];
  edges?: SwarmEdge[];
};

export type UpdateSwarmWorkflowPatch = {
  name?: string;
  description?: string;
  orchestratorAgentId?: string;
  enabled?: boolean;
};

export type CreateSwarmNodeInput = {
  id?: string;
  name: string;
  type?: SwarmNodeType;
  prompt?: string;
  agentId?: string;
  skillRefs?: string[];
  config?: Record<string, unknown>;
  schedule?: SwarmNodeScheduleInput;
  enabled?: boolean;
};

export type UpdateSwarmNodePatch = {
  name?: string;
  type?: SwarmNodeType;
  prompt?: string;
  agentId?: string;
  skillRefs?: string[];
  config?: Record<string, unknown>;
  schedule?: SwarmNodeScheduleInput | null;
  enabled?: boolean;
};

export type SwarmPersistenceMode = "on" | "off";

export type SwarmStateFile = {
  version: 1;
  workflows: SwarmWorkflow[];
  savedAt: string;
};

export type SwarmServiceOptions = {
  scheduler: SchedulerService;
  persistence?: SwarmPersistenceMode;
  stateFilePath?: string;
};
