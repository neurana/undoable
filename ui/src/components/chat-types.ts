export type ChatEntry =
  | { kind: "user"; content: string; images?: string[] }
  | { kind: "assistant"; content: string; streaming?: boolean }
  | { kind: "thinking"; content: string; streaming?: boolean }
  | { kind: "tool_call"; name: string; args: Record<string, unknown>; iteration?: number; maxIterations?: number }
  | { kind: "tool_result"; name: string; result: unknown }
  | { kind: "approval"; id: string; tool: string; description?: string; args?: Record<string, unknown>; resolved?: boolean; approved?: boolean }
  | { kind: "warning"; content: string };

export type SessionItem = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
};

export type ApiMessage = {
  role: string;
  content?: string | null;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

export type SseEvent = {
  type: string;
  content?: string;
  recovery?: string;
  status?: number;
  code?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  id?: string;
  tool?: string;
  description?: string;
  iteration?: number;
  maxIterations?: number;
  mode?: string;
  approvalMode?: string;
  configuredMaxIterations?: number;
  dangerouslySkipPermissions?: boolean;
  economyMode?: boolean;
  sessionId?: string;
  thinking?: string;
  reasoningVisibility?: string;
  streaming?: boolean;
  model?: string;
  provider?: string;
  canThink?: boolean;
  runId?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
};
