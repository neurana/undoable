import type { LLMProvider, LLMContext, LLMStreamEvent, LLMResult, ModelDef, TokenUsage, ThinkLevel } from "../types.js";
import { buildSystemPrompt, buildUserPrompt } from "../system-prompt.js";
import { readSseStream, parsePlanFromRaw } from "../stream-parsers.js";

export type AnthropicConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  thinkLevel?: ThinkLevel;
};

const DEFAULT_MODEL = "claude-opus-4-6";
const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";

const ANTHROPIC_MODELS: ModelDef[] = [
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic", api: "anthropic-messages", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxOutputTokens: 32768 },
  { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5", provider: "anthropic", api: "anthropic-messages", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxOutputTokens: 32768 },
  { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", provider: "anthropic", api: "anthropic-messages", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxOutputTokens: 16384 },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", provider: "anthropic", api: "anthropic-messages", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxOutputTokens: 8192 },
  { id: "claude-opus-4-1-20250805", name: "Claude Opus 4.1", provider: "anthropic", api: "anthropic-messages", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxOutputTokens: 32768 },
  { id: "claude-opus-4-20250514", name: "Claude Opus 4", provider: "anthropic", api: "anthropic-messages", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxOutputTokens: 32768 },
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", api: "anthropic-messages", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxOutputTokens: 16384 },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", provider: "anthropic", api: "anthropic-messages", reasoning: false, input: ["text", "image"], contextWindow: 200000, maxOutputTokens: 8192 },
];

const THINK_BUDGET: Record<ThinkLevel, number> = {
  off: 0,
  minimal: 1024,
  low: 4096,
  medium: 10240,
  high: 32768,
};

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";

  private config: AnthropicConfig;

  constructor(config: AnthropicConfig) {
    this.config = config;
  }

  async generatePlan(context: LLMContext): Promise<LLMResult> {
    const start = Date.now();
    const body = this.buildRequestBody(context);
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.headers(context),
      body: JSON.stringify(body),
      signal: context.abortSignal,
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string; thinking?: string }>;
      usage?: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
      stop_reason?: string;
    };
    const textBlocks = data.content.filter((b) => b.type === "text");
    const content = textBlocks.map((b) => b.text ?? "").join("");
    const plan = parsePlanFromRaw(content);
    const usage = data.usage ? this.mapUsage(data.usage) : undefined;

    return {
      plan,
      usage,
      model: this.model,
      provider: this.id,
      durationMs: Date.now() - start,
      finishReason: data.stop_reason,
    };
  }

  async *streamPlan(context: LLMContext): AsyncIterable<LLMStreamEvent> {
    const body = this.buildRequestBody(context, true);
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.headers(context),
      body: JSON.stringify(body),
      signal: context.abortSignal,
    });

    if (!res.ok) {
      yield { type: "error", error: `Anthropic API error: ${res.status} ${res.statusText}` };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    let fullContent = "";

    for await (const line of readSseStream(reader)) {
      try {
        const parsed = JSON.parse(line.data) as {
          type: string;
          delta?: { type?: string; text?: string; thinking?: string };
          usage?: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
        };
        if (parsed.type === "content_block_delta") {
          if (parsed.delta?.type === "thinking_delta" && parsed.delta.thinking) {
            yield { type: "reasoning", content: parsed.delta.thinking };
          } else if (parsed.delta?.text) {
            fullContent += parsed.delta.text;
            yield { type: "token", content: parsed.delta.text };
          }
        }
        if (parsed.type === "message_delta" && parsed.usage) {
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
    return ANTHROPIC_MODELS;
  }

  resolveModel(modelId: string): ModelDef | undefined {
    return ANTHROPIC_MODELS.find((m) => m.id === modelId);
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? DEFAULT_BASE_URL;
  }

  private get model(): string {
    return this.config.model ?? DEFAULT_MODEL;
  }

  private resolveThinkLevel(context: LLMContext): ThinkLevel {
    return context.thinkLevel ?? this.config.thinkLevel ?? "off";
  }

  private headers(context?: LLMContext): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.config.apiKey,
      "anthropic-version": "2023-06-01",
    };
    const thinkLevel = context ? this.resolveThinkLevel(context) : "off";
    if (thinkLevel !== "off") {
      h["anthropic-beta"] = "extended-thinking-2025-04-11";
    }
    return h;
  }

  private buildRequestBody(context: LLMContext, stream = false) {
    const thinkLevel = this.resolveThinkLevel(context);
    const budget = THINK_BUDGET[thinkLevel] ?? 0;
    const useThinking = budget > 0 && this.isReasoningModel();

    return {
      model: this.model,
      stream,
      max_tokens: this.config.maxTokens ?? 16384,
      ...(useThinking ? { thinking: { type: "enabled" as const, budget_tokens: budget } } : {}),
      system: buildSystemPrompt(context),
      messages: [
        { role: "user" as const, content: buildUserPrompt(context.instruction) },
      ],
    };
  }

  private isReasoningModel(): boolean {
    return ANTHROPIC_MODELS.find((m) => m.id === this.model)?.reasoning ?? false;
  }

  private mapUsage(raw: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }): TokenUsage {
    return {
      inputTokens: raw.input_tokens,
      outputTokens: raw.output_tokens,
      cacheReadTokens: raw.cache_read_input_tokens,
      cacheWriteTokens: raw.cache_creation_input_tokens,
      totalTokens: raw.input_tokens + raw.output_tokens,
    };
  }
}
