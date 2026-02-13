const BASE = "/api";

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("undoable_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
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

export const api = {
  runs: {
    list: () => request<RunItem[]>("/runs"),
    get: (id: string) => request<RunItem>(`/runs/${id}`),
    create: (instruction: string) => request<RunItem>("/runs", { method: "POST", body: JSON.stringify({ instruction }) }),
    action: (id: string, action: string) => request<RunItem>(`/runs/${id}/${action}`, { method: "POST" }),
    delete: (id: string) => request<{ deleted: boolean }>(`/runs/${id}`, { method: "DELETE" }),
  },
  users: {
    list: () => request<UserItem[]>("/users"),
    create: (username: string, role?: string) => request<UserItem>("/users", { method: "POST", body: JSON.stringify({ username, role }) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/users/${id}`, { method: "DELETE" }),
  },
  agents: {
    list: () => request<AgentItem[]>("/agents"),
    get: (id: string) => request<AgentItem>(`/agents/${id}`),
  },
  jobs: {
    list: () => request<JobItem[]>("/jobs"),
    create: (job: JobCreateInput) => request<JobItem>("/jobs", { method: "POST", body: JSON.stringify(job) }),
    update: (id: string, patch: Record<string, unknown>) => request<JobItem>(`/jobs/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    remove: (id: string) => request<{ deleted: boolean }>(`/jobs/${id}`, { method: "DELETE" }),
    run: (id: string, force = false) => request<{ ran: boolean }>(`/jobs/${id}/run?force=${force}`, { method: "POST" }),
    status: () => request<JobStatus>("/jobs/status"),
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
};

export type UserItem = {
  id: string;
  username: string;
  role: string;
  apiKey?: string;
  createdAt?: string;
};

export type AgentItem = {
  id: string;
  model?: string;
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
  schedule: { kind: string; everyMs?: number; at?: string; expr?: string };
  payload: { kind: string; instruction?: string; text?: string };
  state: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
    lastError?: string;
    consecutiveErrors?: number;
  };
};

export type JobCreateInput = {
  name: string;
  enabled?: boolean;
  schedule: Record<string, unknown>;
  payload: Record<string, unknown>;
};

export type JobStatus = {
  enabled: boolean;
  storePath: string;
  jobCount: number;
  nextWakeAtMs: number | null;
};
