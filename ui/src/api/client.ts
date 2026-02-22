const BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("undoable_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function throwHttpError(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
}

function fileNameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;

  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return utf8[1];
    }
  }

  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain?.[1] || null;
}

function fallbackFileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  const name = parts[parts.length - 1]?.trim();
  return name || "download";
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...authHeaders(),
    ...(opts.headers as Record<string, string>),
  };

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    await throwHttpError(res);
  }
  return res.json() as Promise<T>;
}

async function gatewayRequest<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const rpc = await request<GatewayRpcResponse<T>>("/gateway", {
    method: "POST",
    body: JSON.stringify({ method, params }),
  });
  if ("error" in rpc) {
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
    download: async (path: string): Promise<{ blob: Blob; fileName: string }> => {
      const res = await fetch(`${BASE}/files/download?path=${encodeURIComponent(path)}`, {
        method: "GET",
        headers: authHeaders(),
      });
      if (!res.ok) {
        await throwHttpError(res);
      }

      const blob = await res.blob();
      const fileName =
        fileNameFromDisposition(res.headers.get("content-disposition")) ||
        fallbackFileName(path);
      return { blob, fileName };
    },
  },
  chat: {
    getRunConfig: () => request<ChatRunConfig>("/chat/run-config"),
    updateRunConfig: (patch: ChatRunConfigPatch) =>
      request<ChatRunConfig>("/chat/run-config", {
        method: "POST",
        body: JSON.stringify(patch),
      }),
    getApprovalMode: () => request<ChatApprovalMode>("/chat/approval-mode"),
    setApprovalMode: (mode: "off" | "mutate" | "always") =>
      request<ChatApprovalMode>("/chat/approval-mode", {
        method: "POST",
        body: JSON.stringify({ mode }),
      }),
    getThinking: () => request<ChatThinkingConfig>("/chat/thinking"),
    setThinking: (patch: ChatThinkingPatch) =>
      request<ChatThinkingConfig>("/chat/thinking", {
        method: "POST",
        body: JSON.stringify(patch),
      }),
  },
  channels: {
    list: () => request<ChannelItem[]>("/channels"),
    get: (id: string) => request<ChannelItem>(`/channels/${id}`),
    update: (
      id: string,
      patch: {
        enabled?: boolean;
        token?: string | null;
        extra?: Record<string, unknown> | null;
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
      gatewayRequest<ChannelProbeSummaryResult>("channels.probe", channel ? { channel, deep } : { deep }),
    capabilities: (channel?: string) =>
      gatewayRequest<ChannelCapabilitiesResult>("channels.capabilities", channel ? { channel } : {}),
    logs: (opts?: { channel?: string; limit?: number }) =>
      gatewayRequest<ChannelLogsResult>("channels.logs", {
        ...(opts?.channel ? { channel: opts.channel } : {}),
        ...(typeof opts?.limit === "number" ? { limit: opts.limit } : {}),
      }),
    resolve: (channel: string, entries: string[], kind: "auto" | "user" | "group" = "auto") =>
      gatewayRequest("channels.resolve", { channel, entries, kind }),
    pairingList: (channel?: string) =>
      gatewayRequest<ChannelPairingListResult>("pairing.list", channel ? { channel } : {}),
    pairingApprove: (input: { requestId?: string; channel?: string; code?: string; approvedBy?: string }) =>
      gatewayRequest<ChannelPairingApproveResult>("pairing.approve", input),
    pairingReject: (input: { requestId?: string; channel?: string; code?: string; rejectedBy?: string }) =>
      gatewayRequest<ChannelPairingRejectResult>("pairing.reject", input),
    pairingRevoke: (channel: string, userId: string) =>
      gatewayRequest<ChannelPairingRevokeResult>("pairing.revoke", { channel, userId }),
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
  health: {
    status: () => request<HealthStatusResponse>("/health"),
    permissions: () => request<PermissionStatusResponse>("/permissions"),
  },
  settings: {
    daemon: {
      get: () => request<DaemonSettingsSnapshot>("/settings/daemon"),
      update: (patch: DaemonSettingsPatch) =>
        request<DaemonSettingsSnapshot>("/settings/daemon", {
          method: "PATCH",
          body: JSON.stringify(patch),
        }),
    },
    operation: {
      get: () => request<DaemonOperationalState>("/control/operation"),
      update: (mode: DaemonOperationMode, reason?: string) =>
        request<DaemonOperationalState>("/control/operation", {
          method: "PATCH",
          body: JSON.stringify({ mode, ...(reason !== undefined ? { reason } : {}) }),
        }),
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
    listOrchestrations: (workflowId: string) =>
      request<SwarmOrchestrationListResult>(`/swarm/workflows/${workflowId}/orchestrations`),
    getOrchestration: (workflowId: string, orchestrationId: string) =>
      request<SwarmOrchestrationDetail>(`/swarm/workflows/${workflowId}/orchestrations/${orchestrationId}`),
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
      request: <T = unknown>(action: string, params: Record<string, unknown> = {}) =>
        gatewayRequest<T>("browser.request", { action, ...params }),
      isHeadless: () => gatewayRequest<{ headless: boolean }>("browser.request", { action: "isHeadless" }),
      setHeadless: (value: boolean) => gatewayRequest<{ headless: boolean }>("browser.request", { action: "setHeadless", value }),
      tabs: () => gatewayRequest<GatewayBrowserTabsResult>("browser.request", { action: "tabs" }),
      navigate: (url: string) => gatewayRequest<GatewayBrowserMessageResult>("browser.request", { action: "navigate", url }),
      openTab: (url?: string) =>
        gatewayRequest<GatewayBrowserTabResult>("browser.request", {
          action: "openTab",
          ...(url ? { url } : {}),
        }),
      focusTab: (index: number) =>
        gatewayRequest<GatewayBrowserMessageResult>("browser.request", { action: "focusTab", index }),
      closeTab: (index: number) =>
        gatewayRequest<GatewayBrowserMessageResult>("browser.request", { action: "closeTab", index }),
      text: () => gatewayRequest<GatewayBrowserTextResult>("browser.request", { action: "text" }),
      snapshot: () => gatewayRequest<GatewayBrowserSnapshotResult>("browser.request", { action: "snapshot" }),
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
  const controller = new AbortController();
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    ...authHeaders(),
  };

  void (async () => {
    const response = await fetch(`${BASE}/runs/${runId}/events`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      let splitIndex = buffer.indexOf("\n\n");
      while (splitIndex >= 0) {
        const chunk = buffer.slice(0, splitIndex);
        buffer = buffer.slice(splitIndex + 2);

        const dataLines = chunk
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());

        if (dataLines.length > 0) {
          const payload = dataLines.join("\n");
          try {
            onEvent(JSON.parse(payload));
          } catch {
            // Ignore malformed payloads and continue consuming stream.
          }
        }

        splitIndex = buffer.indexOf("\n\n");
      }
    }
  })().catch(() => {
    // Keep stream helper resilient; consumers can reconnect from UI actions.
  });

  return () => controller.abort();
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
  maxParallel?: number;
  failFast?: boolean;
  respectDependencies?: boolean;
};

export type SwarmWorkflowRunResult = {
  workflowId: string;
  orchestrationId: string;
  status: "running" | "completed" | "failed";
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
  pendingNodes: string[];
  failedNodes: string[];
  blockedNodes: string[];
  options: Required<SwarmWorkflowRunInput>;
  startedAt: string;
  completedAt?: string;
};

export type SwarmOrchestrationNodeStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped"
  | "blocked";

export type SwarmOrchestrationNodeState = {
  nodeId: string;
  status: SwarmOrchestrationNodeStatus;
  dependsOn: string[];
  runId?: string;
  jobId?: string;
  agentId?: string;
  reason?: string;
  startedAt?: string;
  completedAt?: string;
};

export type SwarmOrchestrationSummary = {
  orchestrationId: string;
  status: "running" | "completed" | "failed";
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
  pendingNodes: string[];
  failedNodes: string[];
  blockedNodes: string[];
  options: Required<SwarmWorkflowRunInput>;
  startedAt: string;
  completedAt?: string;
};

export type SwarmOrchestrationListResult = {
  workflowId: string;
  orchestrations: SwarmOrchestrationSummary[];
};

export type SwarmOrchestrationDetail = SwarmOrchestrationSummary & {
  workflowId: string;
  nodes: SwarmOrchestrationNodeState[];
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
  hasToken?: boolean;
  hasAppToken?: boolean;
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

export type ChannelPairingStatus = "pending" | "approved" | "rejected" | "expired";

export type ChannelPairingRequest = {
  requestId: string;
  channelId: string;
  userId: string;
  chatId: string;
  code: string;
  status: ChannelPairingStatus;
  createdAt: number;
  updatedAt: number;
  lastPromptAt?: number;
  promptCount: number;
  resolvedAt?: number;
  resolvedBy?: string;
};

export type ChannelPairingApproval = {
  channelId: string;
  userId: string;
  approvedAt: number;
  requestId?: string;
  approvedBy?: string;
};

export type ChannelPairingListResult = {
  channel: string | null;
  pending: ChannelPairingRequest[];
  approved: ChannelPairingApproval[];
  recent: ChannelPairingRequest[];
};

export type ChannelPairingApproveResult = {
  ok: boolean;
  request?: ChannelPairingRequest;
  approval?: ChannelPairingApproval;
  error?: string;
};

export type ChannelPairingRejectResult = {
  ok: boolean;
  request?: ChannelPairingRequest;
  error?: string;
};

export type ChannelPairingRevokeResult = {
  ok: boolean;
  removed?: ChannelPairingApproval;
  error?: string;
};

export type ChannelItem = {
  config: ChannelConfigItem;
  status: ChannelStatusItem;
  snapshot?: ChannelSnapshotItem;
};

export type ChannelProbeCheck = {
  name: string;
  ok: boolean;
  severity: "info" | "warn" | "error";
  message: string;
};

export type ChannelProbeResult = {
  channelId: string;
  probedAt: number;
  connected: boolean;
  ok: boolean;
  checks: ChannelProbeCheck[];
};

export type ChannelProbeSummaryResult = {
  ts: number;
  deep: boolean;
  channelOrder: string[];
  probes: Record<string, ChannelProbeResult>;
  okCount: number;
  failCount: number;
};

export type ChannelCapability = {
  channelId: string;
  name: string;
  auth: string[];
  supports: string[];
  toolActions: string[];
  notes: string[];
};

export type ChannelCapabilitiesResult = {
  ts: number;
  channelOrder: string[];
  capabilities: Record<string, ChannelCapability>;
};

export type ChannelLogEntry = {
  id: string;
  ts: number;
  channelId: string;
  level: "info" | "warn" | "error";
  event: string;
  message: string;
  meta?: Record<string, unknown>;
};

export type ChannelLogsResult = {
  ts: number;
  channel: string | null;
  limit: number;
  count: number;
  logs: ChannelLogEntry[];
};

type GatewayRpcResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error: { code: string; message: string } };

export type GatewayTtsStatus = {
  enabled: boolean;
  provider: string;
  providers: string[];
};

export type GatewayBrowserTab = {
  index: number;
  url: string;
  title: string;
  active: boolean;
};

export type GatewayBrowserMessageResult = {
  message: string;
};

export type GatewayBrowserTabResult = {
  tab: GatewayBrowserTab;
};

export type GatewayBrowserTabsResult = {
  tabs: GatewayBrowserTab[];
};

export type GatewayBrowserTextResult = {
  text: string;
};

export type GatewayBrowserSnapshotNode = {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  children?: GatewayBrowserSnapshotNode[];
};

export type GatewayBrowserSnapshotResult = {
  snapshot: GatewayBrowserSnapshotNode | null;
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

export type ChatApprovalMode = {
  mode: "off" | "mutate" | "always";
  dangerouslySkipPermissions?: boolean;
};

export type ChatThinkingConfig = {
  level: "off" | "low" | "medium" | "high";
  visibility: "off" | "on" | "stream";
  canThink?: boolean;
  economyMode?: boolean;
};

export type ChatThinkingPatch = {
  level?: "off" | "low" | "medium" | "high";
  visibility?: "off" | "on" | "stream";
};

export type ChatRunConfig = {
  mode: "interactive" | "autonomous" | "supervised";
  maxIterations: number;
  configuredMaxIterations?: number;
  approvalMode: "off" | "mutate" | "always";
  dangerouslySkipPermissions?: boolean;
  thinking: "off" | "low" | "medium" | "high";
  reasoningVisibility: "off" | "on" | "stream";
  model?: string;
  provider?: string;
  canThink?: boolean;
  economyMode: boolean;
  allowIrreversibleActions: boolean;
  undoGuaranteeEnabled?: boolean;
  economy?: {
    maxIterationsCap?: number;
    toolResultMaxChars?: number;
    contextMaxTokens?: number;
    contextThreshold?: number;
  };
  spendGuard?: {
    dailyBudgetUsd?: number | null;
    spentLast24hUsd?: number;
    remainingUsd?: number | null;
    exceeded?: boolean;
    autoPauseOnLimit?: boolean;
    paused?: boolean;
  };
};

export type ChatRunConfigPatch = {
  mode?: "interactive" | "autonomous" | "supervised";
  maxIterations?: number;
  economyMode?: boolean;
  dailyBudgetUsd?: number | null;
  spendPaused?: boolean;
  allowIrreversibleActions?: boolean;
};

export type HealthStatusResponse = {
  status: "ok" | "degraded";
  ready: boolean;
  version: string;
  uptime: number;
  checks: Record<string, unknown>;
};

export type PermissionStatusResponse = {
  fullDiskAccess: boolean;
  details: Record<string, boolean>;
  platform: string;
  fix?: string;
};

export type DaemonBindMode = "loopback" | "all" | "custom";
export type DaemonAuthMode = "open" | "token";
export type DaemonSecurityPolicy = "strict" | "balanced" | "permissive";
export type DaemonOperationMode = "normal" | "drain" | "paused";

export type DaemonOperationalState = {
  mode: DaemonOperationMode;
  reason: string;
  updatedAt: string;
};

export type DaemonSettingsRecord = {
  host: string;
  port: number;
  bindMode: DaemonBindMode;
  authMode: DaemonAuthMode;
  token: string;
  securityPolicy: DaemonSecurityPolicy;
  operationMode: DaemonOperationMode;
  operationReason: string;
  updatedAt: string;
};

export type DaemonSettingsSnapshot = {
  settingsFile: string;
  desired: DaemonSettingsRecord;
  effective: {
    host: string;
    port: number;
    bindMode: DaemonBindMode;
    authMode: DaemonAuthMode;
    tokenSet: boolean;
    securityPolicy: DaemonSecurityPolicy;
    operationMode: DaemonOperationMode;
    operationReason: string;
  };
  restartRequired: boolean;
};

export type DaemonSettingsPatch = Partial<{
  host: string;
  port: number;
  bindMode: DaemonBindMode;
  authMode: DaemonAuthMode;
  token: string;
  rotateToken: boolean;
  securityPolicy: DaemonSecurityPolicy;
  operationMode: DaemonOperationMode;
  operationReason: string;
}>;
