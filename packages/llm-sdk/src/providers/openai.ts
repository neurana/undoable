import type { LLMProvider, LLMContext, LLMStreamEvent, LLMResult, ModelDef, TokenUsage } from "../types.js";
import { buildSystemPrompt, buildUserPrompt } from "../system-prompt.js";
import { readSseStream, parsePlanFromRaw } from "../stream-parsers.js";

export type OpenAIConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
};

const DEFAULT_MODEL = "gpt-5.2";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

const OPENAI_MODELS: ModelDef[] = [
  { id: "gpt-5.2", name: "GPT-5.2", provider: "openai", api: "openai-completions", reasoning: true, input: ["text", "image"], contextWindow: 400000, maxOutputTokens: 32768 },
  { id: "gpt-5.2-pro", name: "GPT-5.2 Pro", provider: "openai", api: "openai-completions", reasoning: true, input: ["text", "image"], contextWindow: 400000, maxOutputTokens: 32768 },
  { id: "gpt-5.2-codex", name: "GPT-5.2 Codex", provider: "openai", api: "openai-completions", reasoning: true, input: ["text", "image"], contextWindow: 400000, maxOutputTokens: 32768 },
  { id: "gpt-5.1", name: "GPT-5.1", provider: "openai", api: "openai-completions", reasoning: true, input: ["text", "image"], contextWindow: 128000, maxOutputTokens: 32768 },
  { id: "gpt-5.1-codex", name: "GPT-5.1 Codex", provider: "openai", api: "openai-completions", reasoning: true, input: ["text", "image"], contextWindow: 400000, maxOutputTokens: 32768 },
  { id: "gpt-5", name: "GPT-5", provider: "openai", api: "openai-completions", reasoning: true, input: ["text", "image"], contextWindow: 400000, maxOutputTokens: 32768 },
  { id: "gpt-5-mini", name: "GPT-5 Mini", provider: "openai", api: "openai-completions", reasoning: false, input: ["text", "image"], contextWindow: 400000, maxOutputTokens: 16384 },
  { id: "o3-pro", name: "o3-pro", provider: "openai", api: "openai-completions", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxOutputTokens: 100000 },
  { id: "o3", name: "o3", provider: "openai", api: "openai-completions", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxOutputTokens: 100000 },
  { id: "o4-mini", name: "o4-mini", provider: "openai", api: "openai-completions", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxOutputTokens: 100000 },
  { id: "gpt-4.1", name: "GPT-4.1", provider: "openai", api: "openai-completions", reasoning: false, input: ["text", "image"], contextWindow: 1047576, maxOutputTokens: 32768 },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai", api: "openai-completions", reasoning: false, input: ["text", "image"], contextWindow: 1047576, maxOutputTokens: 32768 },
  { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", provider: "openai", api: "openai-completions", reasoning: false, input: ["text", "image"], contextWindow: 1047576, maxOutputTokens: 32768 },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", api: "openai-completions", reasoning: false, input: ["text", "image"], contextWindow: 128000, maxOutputTokens: 16384 },
];

export class OpenAIProvider implements LLMProvider {
  readonly id = "openai";
  readonly name = "OpenAI";

  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
  }

  async generatePlan(context: LLMContext): Promise<LLMResult> {
    const start = Date.now();
    const body = this.buildRequestBody(context);
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: context.abortSignal,
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    const content = data.choices[0]!.message.content;
    const plan = parsePlanFromRaw(content);
    const usage = data.usage ? this.mapUsage(data.usage) : undefined;

    return {
      plan,
      usage,
      model: this.model,
      provider: this.id,
      durationMs: Date.now() - start,
      finishReason: data.choices[0]?.finish_reason,
    };
  }

  async *streamPlan(context: LLMContext): AsyncIterable<LLMStreamEvent> {
    const body = this.buildRequestBody(context, true);
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: context.abortSignal,
    });

    if (!res.ok) {
      yield { type: "error", error: `OpenAI API error: ${res.status} ${res.statusText}` };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    let fullContent = "";

    for await (const line of readSseStream(reader)) {
      if (line.data === "[DONE]") break;
      try {
        const parsed = JSON.parse(line.data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          yield { type: "token", content: delta };
        }
        if (parsed.usage) {
          yield { type: "usage", usage: this.mapUsage(parsed.usage) };
        }
      } catch {
        continue;
      }
    }

    try {
      const plan = parsePlanFromRaw(fullContent);
      yield { type: "done", plan };
    } catch (err) {
      yield { type: "error", error: `Failed to parse plan: ${(err as Error).message}` };
    }
  }

  async listModels(): Promise<ModelDef[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, { headers: this.headers() });
      if (!res.ok) return OPENAI_MODELS;
      const data = (await res.json()) as { data: Array<{ id: string }> };
      const remote = data.data
        .filter((m) => m.id.startsWith("gpt-") || m.id.startsWith("o"))
        .map((m): ModelDef => {
          const known = OPENAI_MODELS.find((k) => k.id === m.id);
          if (known) return known;
          return { id: m.id, name: m.id, provider: "openai", reasoning: false, input: ["text"], contextWindow: 128000, maxOutputTokens: 16384 };
        });
      return remote.length > 0 ? remote : OPENAI_MODELS;
    } catch {
      return OPENAI_MODELS;
    }
  }

  resolveModel(modelId: string): ModelDef | undefined {
    return OPENAI_MODELS.find((m) => m.id === modelId);
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? DEFAULT_BASE_URL;
  }

  private get model(): string {
    return this.config.model ?? DEFAULT_MODEL;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  private isReasoningModel(): boolean {
    return OPENAI_MODELS.find((m) => m.id === this.model)?.reasoning ?? false;
  }

  private buildRequestBody(context: LLMContext, stream = false) {
    const isReasoning = this.isReasoningModel();
    return {
      model: this.model,
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...(isReasoning ? {} : { temperature: this.config.temperature ?? 0 }),
      ...(isReasoning
        ? { max_completion_tokens: this.config.maxTokens ?? 16384 }
        : { max_tokens: this.config.maxTokens ?? 16384 }),
      response_format: { type: "json_object" as const },
      messages: [
        { role: isReasoning ? "developer" as const : "system" as const, content: buildSystemPrompt(context) },
        { role: "user" as const, content: buildUserPrompt(context.instruction) },
      ],
    };
  }

  private mapUsage(raw: { prompt_tokens: number; completion_tokens: number; total_tokens: number }): TokenUsage {
    return {
      inputTokens: raw.prompt_tokens,
      outputTokens: raw.completion_tokens,
      totalTokens: raw.total_tokens,
    };
  }
}
