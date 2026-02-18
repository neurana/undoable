const BASE = "/api";

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("undoable_token");
  const headers: Record<string, string> = {
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function gatewayRequest<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const rpc = await request<GatewayRpcResponse<T>>("/gateway", {
    method: "POST",
    body: JSON.stringify({ method, params }),
  });
  if (!rpc.ok) {
    throw new Error(rpc.error.message);
  }
  return rpc.result;
}

export const api = {
  runs: {
    list: () => request<RunItem[]>("/runs"),
    listByJobId: (jobId: string) => request<RunItem[]>(`/runs?jobId=${encodeURIComponent(jobId)}`),
    get: (id: string) => request<RunItem>(`/runs/${id}`),
    create: (instruction: string) => request<RunItem>("/runs", { method: "POST", body: JSON.stringify({ instruction }) }),
    action: (id: string, action: string) => request<RunItem>(`/runs/${id}/${action}`, { method: "POST" }),
    delete: (id: string) => request<{ deleted: boolean }>(`/runs/${id}`, { method: "DELETE" }),
  },
  agents: {
    list: () => request<AgentItem[]>("/agents"),
    get: (id: string) => request<AgentItem>(`/agents/${id}`),
    create: (agent: AgentCreateInput) => request<AgentItem>("/agents", { method: "POST", body: JSON.stringify(agent) }),
    update: (id: string, patch: Partial<AgentCreateInput>) => request<AgentItem>(`/agents/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/agents/${id}`, { method: "DELETE" }),
  },
  files: {
    open: (path: string) => request<{ opened: boolean; path: string }>("/files/open", { method: "POST", body: JSON.stringify({ path }) }),
  },
  channels: {
    list: () => request<ChannelItem[]>("/channels"),
    get: (id: string) => request<ChannelItem>(`/channels/${id}`),
    update: (
      id: string,
      patch: {
        enabled?: boolean;
        token?: string;
        extra?: Record<string, unknown>;
        allowDMs?: boolean;
        allowGroups?: boolean;
        userAllowlist?: string[];
        userBlocklist?: string[];
        rateLimit?: number;
        maxMediaBytes?: number;
      },
    ) =>
      request<ChannelConfigItem>(`/channels/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
    start: (id: string) => request<{ started: boolean }>(`/channels/${id}/start`, { method: "POST" }),
    stop: (id: string) => request<{ stopped: boolean }>(`/channels/${id}/stop`, { method: "POST" }),
    probe: (channel?: string, deep = true) =>
      gatewayRequest("channels.probe", channel ? { channel, deep } : { deep }),
    capabilities: (channel?: string) =>
      gatewayRequest("channels.capabilities", channel ? { channel } : {}),
    logs: (opts?: { channel?: string; limit?: number }) =>
      gatewayRequest("channels.logs", {
        ...(opts?.channel ? { channel: opts.channel } : {}),
        ...(typeof opts?.limit === "number" ? { limit: opts.limit } : {}),
      }),
    resolve: (channel: string, entries: string[], kind: "auto" | "user" | "group" = "auto") =>
      gatewayRequest("channels.resolve", { channel, entries, kind }),
    pairingList: (channel?: string) =>
      gatewayRequest("pairing.list", channel ? { channel } : {}),
    pairingApprove: (input: { requestId?: string; channel?: string; code?: string; approvedBy?: string }) =>
      gatewayRequest("pairing.approve", input),
    pairingReject: (input: { requestId?: string; channel?: string; code?: string; rejectedBy?: string }) =>
      gatewayRequest("pairing.reject", input),
    pairingRevoke: (channel: string, userId: string) =>
      gatewayRequest("pairing.revoke", { channel, userId }),
  },
  sessions: {
    list: (opts?: { limit?: number; active_minutes?: number; include_internal?: boolean }) => {
      const params = new URLSearchParams();
      if (opts?.limit) params.set("limit", String(opts.limit));
      if (opts?.active_minutes) params.set("active_minutes", String(opts.active_minutes));
      if (opts?.include_internal) params.set("include_internal", "true");
      const qs = params.toString();
      return request<SessionListItem[]>(`/sessions${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) => request<SessionDetailItem>(`/sessions/${id}`),
    history: (id: string, opts?: { limit?: number; include_tools?: boolean }) => {
      const params = new URLSearchParams();
      if (opts?.limit) params.set("limit", String(opts.limit));
      if (opts?.include_tools) params.set("include_tools", "true");
      const qs = params.toString();
      return request<{ messages: unknown[]; count: number }>(`/sessions/${id}/history${qs ? `?${qs}` : ""}`);
    },
  },
  jobs: {
    list: () => request<JobItem[]>("/jobs"),
    create: (job: JobCreateInput) => request<JobItem>("/jobs", { method: "POST", body: JSON.stringify(job) }),
    update: (id: string, patch: Record<string, unknown>) => request<JobItem>(`/jobs/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    remove: (id: string) => request<{ deleted: boolean }>(`/jobs/${id}`, { method: "DELETE" }),
    run: (id: string, force = false) => request<{ ran: boolean }>(`/jobs/${id}/run?force=${force}`, { method: "POST" }),
    status: () => request<JobStatus>("/jobs/status"),
    historyStatus: () => request<JobHistoryStatus>("/jobs/history/status"),
    undo: () => request<{ ok: true; result: JobHistoryMutationResult; status: JobHistoryStatus }>("/jobs/history/undo", { method: "POST" }),
    redo: () => request<{ ok: true; result: JobHistoryMutationResult; status: JobHistoryStatus }>("/jobs/history/redo", { method: "POST" }),
  },
  swarm: {
    listWorkflows: () => request<SwarmWorkflow[]>("/swarm/workflows"),
    getWorkflow: (id: string) => request<SwarmWorkflow>(`/swarm/workflows/${id}`),
    createWorkflow: (input: SwarmWorkflowCreateInput) =>
      request<SwarmWorkflow>("/swarm/workflows", { method: "POST", body: JSON.stringify(input) }),
    updateWorkflow: (id: string, patch: SwarmWorkflowPatchInput) =>
      request<SwarmWorkflow>(`/swarm/workflows/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    deleteWorkflow: (id: string) => request<{ deleted: boolean }>(`/swarm/workflows/${id}`, { method: "DELETE" }),
    addNode: (workflowId: string, input: SwarmNodeCreateInput) =>
      request<SwarmWorkflowNode>(`/swarm/workflows/${workflowId}/nodes`, { method: "POST", body: JSON.stringify(input) }),
    updateNode: (workflowId: string, nodeId: string, patch: SwarmNodePatchInput) =>
      request<SwarmWorkflowNode>(`/swarm/workflows/${workflowId}/nodes/${nodeId}`, { method: "PATCH", body: JSON.stringify(patch) }),
    deleteNode: (workflowId: string, nodeId: string) =>
      request<{ deleted: boolean }>(`/swarm/workflows/${workflowId}/nodes/${nodeId}`, { method: "DELETE" }),
    setEdges: (workflowId: string, edges: SwarmEdge[]) =>
      request<SwarmWorkflow>(`/swarm/workflows/${workflowId}/edges`, { method: "PUT", body: JSON.stringify({ edges }) }),
    upsertEdge: (workflowId: string, edge: SwarmEdge) =>
      request<SwarmWorkflow>(`/swarm/workflows/${workflowId}/edges`, { method: "POST", body: JSON.stringify(edge) }),
    deleteEdge: (workflowId: string, from: string, to: string) =>
      request<{ deleted: boolean }>(`/swarm/workflows/${workflowId}/edges?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { method: "DELETE" }),
    listNodeRuns: (workflowId: string, nodeId: string) =>
      request<{ jobId: string | null; runs: RunItem[] }>(`/swarm/workflows/${workflowId}/nodes/${nodeId}/runs`),
    runNode: (workflowId: string, nodeId: string) =>
      request<RunItem>(`/swarm/workflows/${workflowId}/nodes/${nodeId}/run`, { method: "POST" }),
    runWorkflow: (workflowId: string, input: SwarmWorkflowRunInput = {}) =>
      request<SwarmWorkflowRunResult>(`/swarm/workflows/${workflowId}/run`, { method: "POST", body: JSON.stringify(input) }),
  },
  undo: {
    list: () => request<UndoListResult>("/chat/undo", { method: "POST", body: JSON.stringify({ action: "list" }) }),
    undoOne: (id: string) => request<UndoOneResult>("/chat/undo", { method: "POST", body: JSON.stringify({ action: "one", id }) }),
    undoLast: (count = 1) => request<UndoManyResult>("/chat/undo", { method: "POST", body: JSON.stringify({ action: "last", count }) }),
    undoAll: () => request<UndoManyResult>("/chat/undo", { method: "POST", body: JSON.stringify({ action: "all" }) }),
    redoOne: (id: string) => request<UndoOneResult>("/chat/undo", { method: "POST", body: JSON.stringify({ action: "redo_one", id }) }),
    redoLast: (count = 1) => request<UndoManyResult>("/chat/undo", { method: "POST", body: JSON.stringify({ action: "redo_last", count }) }),
    redoAll: () => request<UndoManyResult>("/chat/undo", { method: "POST", body: JSON.stringify({ action: "redo_all" }) }),
  },
  gateway: {
    call: (method: string, params: Record<string, unknown> = {}) => gatewayRequest<unknown>(method, params),
    tts: {
      status: () => gatewayRequest<GatewayTtsStatus>("tts.status"),
      providers: () => gatewayRequest<{ providers: string[]; active: string }>("tts.providers"),
      enable: () => gatewayRequest<{ enabled: boolean; provider: string }>("tts.enable"),
      disable: () => gatewayRequest<{ enabled: boolean; provider: string }>("tts.disable"),
      setProvider: (provider: string) => gatewayRequest<{ provider: string; providers: string[] }>("tts.setProvider", { provider }),
    },
    browser: {
      isHeadless: () => gatewayRequest<{ headless: boolean }>("browser.request", { action: "isHeadless" }),
      setHeadless: (value: boolean) => gatewayRequest<{ headless: boolean }>("browser.request", { action: "setHeadless", value }),
    },
    agentsFiles: {
      list: (agentId: string) => gatewayRequest<GatewayAgentFilesListResult>("agents.files.list", { agentId }),
      get: (agentId: string, path = "instructions.md") => gatewayRequest<GatewayAgentFileGetResult>("agents.files.get", { agentId, path }),
      set: (agentId: string, content: string, summary?: string, path = "instructions.md") => gatewayRequest<GatewayAgentFileSetResult>("agents.files.set", {
        agentId,
        path,
        content,
        ...(summary ? { summary } : {}),
      }),
    },
  },
};

export function streamEvents(runId: string, onEvent: (event: unknown) => void): () => void {
  const token = localStorage.getItem("undoable_token");
  const url = `${BASE}/runs/${runId}/events${token ? `?token=${token}` : ""}`;
  const source = new EventSource(url);
  source.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch {}
  };
  return () => source.close();
}

export type RunItem = {
  id: string;
  userId: string;
  agentId: string;
  status: string;
  instruction: string;
  createdAt: string;
  updatedAt: string;
  jobId?: string;
};

export type AgentItem = {
  id: string;
  name?: string;
  model: string;
  instructions?: string;
  skills: string[];
  sandbox: { docker: boolean; network: boolean; browser: boolean };
  default?: boolean;
};

export type AgentCreateInput = {
  id: string;
  name?: string;
  model: string;
  instructions?: string;
  skills?: string[];
  sandbox?: Partial<{ docker: boolean; network: boolean; browser: boolean }>;
  default?: boolean;
};

export type JobItem = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: { kind: string; everyMs?: number; anchorMs?: number; at?: string; expr?: string; tz?: string };
  payload: { kind: string; instruction?: string; text?: string; agentId?: string; model?: string };
  state: {
    nextRunAtMs?: number;
    runningAtMs?: number;
    lastRunAtMs?: number;
    lastRunId?: string;
    lastStatus?: string;
    lastError?: string;
    lastDurationMs?: number;
    consecutiveErrors?: number;
  };
};

export type JobCreateInput = {
  name: string;
  description?: string;
  enabled?: boolean;
  deleteAfterRun?: boolean;
  schedule: Record<string, unknown>;
  payload: Record<string, unknown>;
};

export type JobStatus = {
  enabled: boolean;
  storePath: string;
  jobCount: number;
  nextWakeAtMs: number | null;
};

export type JobHistoryMutationResult = {
  ok: boolean;
  kind: "create" | "update" | "delete" | "none";
  label: string;
  jobId?: string;
  error?: string;
};

export type JobHistoryStatus = {
  undoCount: number;
  redoCount: number;
  nextUndo?: { id: string; kind: "create" | "update" | "delete"; label: string; createdAtMs: number };
  nextRedo?: { id: string; kind: "create" | "update" | "delete"; label: string; createdAtMs: number };
};

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

export type SwarmWorkflowCreateInput = {
  id?: string;
  name: string;
  description?: string;
  orchestratorAgentId?: string;
  enabled?: boolean;
  nodes?: SwarmNodeCreateInput[];
  edges?: SwarmEdge[];
};

export type SwarmWorkflowPatchInput = {
  name?: string;
  description?: string;
  orchestratorAgentId?: string;
  enabled?: boolean;
};

export type SwarmNodeCreateInput = {
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

export type SwarmNodePatchInput = {
  name?: string;
  type?: SwarmNodeType;
  prompt?: string;
  agentId?: string;
  skillRefs?: string[];
  config?: Record<string, unknown>;
  schedule?: SwarmNodeScheduleInput | null;
  enabled?: boolean;
};

export type SwarmWorkflowRunInput = {
  nodeIds?: string[];
  includeDisabled?: boolean;
  allowConcurrent?: boolean;
};

export type SwarmWorkflowRunResult = {
  workflowId: string;
  launched: Array<{
    nodeId: string;
    runId: string;
    jobId: string;
    agentId: string;
  }>;
  skipped: Array<{
    nodeId: string;
    reason: string;
    activeRunId?: string;
  }>;
  startedAt: string;
};

export type NodeItem = {
  nodeId: string;
  connectorType: string;
  displayName: string;
  platform?: string;
  capabilities: string[];
  commands: string[];
  connected: boolean;
  connectedAt?: number;
};

export type ChannelConfigItem = {
  channelId: string;
  enabled: boolean;
  token?: string;
  extra?: Record<string, unknown>;
  allowDMs?: boolean;
  allowGroups?: boolean;
  userAllowlist?: string[];
  userBlocklist?: string[];
  rateLimit?: number;
  maxMediaBytes?: number;
};

export type ChannelStatusItem = {
  channelId: string;
  connected: boolean;
  accountName?: string;
  error?: string;
  qrDataUrl?: string;
};

export type ChannelSnapshotItem = {
  channelId: string;
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  status: "connected" | "awaiting_scan" | "error" | "offline";
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
  allowlistCount: number;
  error?: string;
  diagnostics: Array<{
    code: string;
    severity: "info" | "warn" | "error";
    message: string;
    recovery?: string;
  }>;
};

export type ChannelItem = {
  config: ChannelConfigItem;
  status: ChannelStatusItem;
  snapshot?: ChannelSnapshotItem;
};

type GatewayRpcResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error: { code: string; message: string } };

export type GatewayTtsStatus = {
  enabled: boolean;
  provider: string;
  providers: string[];
};

export type GatewayAgentFileRow = {
  path: string;
  exists: boolean;
  size: number;
};

export type GatewayAgentFilesListResult = {
  agentId: string;
  files: GatewayAgentFileRow[];
};

export type GatewayAgentFileGetResult = {
  agentId: string;
  path: string;
  content: string;
};

export type GatewayAgentFileSetResult = {
  agentId: string;
  path: string;
  version: number;
};

export type SessionListItem = {
  id: string;
  title: string;
  agentId?: string;
  messageCount: number;
  preview?: string;
  createdAt: number;
  updatedAt: number;
};

export type SessionDetailItem = {
  id: string;
  title: string;
  agentId?: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
};

export type UndoActionSummary = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  startedAt: string;
};

export type UndoResult = {
  actionId: string;
  toolName: string;
  success: boolean;
  error?: string;
  note?: string;
};

export type UndoListResult = {
  recordedCount?: number;
  undoable: UndoActionSummary[];
  redoable: UndoActionSummary[];
  nonUndoableRecent?: Array<{
    id: string;
    tool: string;
    category: string;
    startedAt: string;
    error?: string | null;
  }>;
};

export type UndoOneResult = {
  result: UndoResult;
};

export type UndoManyResult = {
  results: UndoResult[];
};
