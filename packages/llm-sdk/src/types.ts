import type { PlanGraph } from "@undoable/shared";

export type ModelApi =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai"
  | "ollama-chat"
  | "bedrock-converse";

export type ModelInputModality = "text" | "image";

export type ThinkLevel = "off" | "minimal" | "low" | "medium" | "high";

export type ModelCost = {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
};

export type ModelDef = {
  id: string;
  name: string;
  provider: string;
  api?: ModelApi;
  reasoning: boolean;
  input: ModelInputModality[];
  contextWindow: number;
  maxOutputTokens: number;
  cost?: ModelCost;
};

export type ModelRef = {
  provider: string;
  model: string;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens: number;
};

export type LLMContext = {
  instruction: string;
  files?: Array<{ path: string; content: string }>;
  repoStructure?: string[];
  gitStatus?: string;
  metadata?: Record<string, unknown>;
  thinkLevel?: ThinkLevel;
  images?: Array<{ mimeType: string; data: string }>;
  abortSignal?: AbortSignal;
};

export type LLMStreamEvent =
  | { type: "token"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "plan_partial"; plan: Partial<PlanGraph> }
  | { type: "usage"; usage: TokenUsage }
  | { type: "done"; plan: PlanGraph }
  | { type: "error"; error: string };

export type LLMResult = {
  plan: PlanGraph;
  usage?: TokenUsage;
  model: string;
  provider: string;
  durationMs: number;
  finishReason?: string;
};

export interface LLMProvider {
  readonly id: string;
  readonly name: string;

  generatePlan(context: LLMContext): Promise<LLMResult>;
  streamPlan?(context: LLMContext): AsyncIterable<LLMStreamEvent>;
  listModels?(): Promise<ModelDef[]>;
  resolveModel?(modelId: string): ModelDef | undefined;
}

export type LLMProviderConfig = {
  provider: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  thinkLevel?: ThinkLevel;
  options?: Record<string, unknown>;
};
