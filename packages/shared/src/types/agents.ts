export type ToolPolicy = {
  allow?: string[];
  deny?: string[];
};

export type AgentIdentity = {
  emoji?: string;
  avatar?: string;
};

export type AgentHeartbeatConfig = {
  intervalMs?: number;
  wakeSchedule?: string;
  autoRestart?: boolean;
};

export type AgentConfig = {
  id: string;
  name?: string;
  model: string;
  fallbacks?: string[];
  instructions?: string;
  workspace?: string;
  identity?: AgentIdentity;
  heartbeat?: AgentHeartbeatConfig;
  skills: string[];
  tools?: ToolPolicy;
  sandbox: SandboxConfig;
  concurrency?: number;
  default?: boolean;
};

export type SandboxConfig = {
  docker: boolean;
  network: boolean;
  browser: boolean;
  resourceLimits?: ResourceLimits;
};

export type ResourceLimits = {
  cpus?: number;
  memoryMb?: number;
  diskMb?: number;
  timeoutMs?: number;
};

export type AgentRoutingRule = {
  match: AgentRouteMatch;
  agentId: string;
};

export type AgentRouteMatch = {
  tag?: string;
  pattern?: string;
  tool?: string;
};

export type SubagentRun = {
  id: string;
  parentRunId: string;
  childRunId: string;
  agentId: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
};
