import type { LLMProvider, LLMContext, LLMStreamEvent, LLMResult, ModelDef, TokenUsage } from "../types.js";
import { buildSystemPrompt, buildUserPrompt } from "../system-prompt.js";
import { readNdjsonStream, parsePlanFromRaw } from "../stream-parsers.js";

export type OllamaConfig = {
  model?: string;
  baseUrl?: string;
};

const DEFAULT_MODEL = "qwen2.5-coder:14b";
const DEFAULT_BASE_URL = "http://localhost:11434";

type OllamaTagModel = {
  name: string;
  size: number;
  details?: { family?: string; parameter_size?: string };
};

export class OllamaProvider implements LLMProvider {
  readonly id = "ollama";
  readonly name = "Ollama (Local)";

  private config: OllamaConfig;
  private discoveredModels: ModelDef[] | null = null;

  constructor(config: OllamaConfig = {}) {
    this.config = config;
  }

  async generatePlan(context: LLMContext): Promise<LLMResult> {
    const start = Date.now();
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: buildSystemPrompt(context) },
          { role: "user", content: buildUserPrompt(context.instruction) },
        ],
      }),
      signal: context.abortSignal,
    });

    if (!res.ok) {
      throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      message: { content: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    const plan = parsePlanFromRaw(data.message.content);
    const usage = this.mapUsage(data);

    return {
      plan,
      usage,
      model: this.model,
      provider: this.id,
      durationMs: Date.now() - start,
      finishReason: "stop",
    };
  }

  async *streamPlan(context: LLMContext): AsyncIterable<LLMStreamEvent> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: true,
        format: "json",
        messages: [
          { role: "system", content: buildSystemPrompt(context) },
          { role: "user", content: buildUserPrompt(context.instruction) },
        ],
      }),
      signal: context.abortSignal,
    });

    if (!res.ok) {
      yield { type: "error", error: `Ollama API error: ${res.status} ${res.statusText}` };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    let fullContent = "";

    for await (const chunk of readNdjsonStream(reader)) {
      const parsed = chunk as { message?: { content?: string }; done?: boolean; prompt_eval_count?: number; eval_count?: number };
      if (parsed.message?.content) {
        fullContent += parsed.message.content;
        yield { type: "token", content: parsed.message.content };
      }
      if (parsed.done) {
        const usage = this.mapUsage(parsed);
        if (usage) {
          yield { type: "usage", usage };
        }
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
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { models: OllamaTagModel[] };
      this.discoveredModels = data.models.map((m) => this.tagToModelDef(m));
      return this.discoveredModels;
    } catch {
      return [];
    }
  }

  resolveModel(modelId: string): ModelDef | undefined {
    return this.discoveredModels?.find((m) => m.id === modelId);
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? DEFAULT_BASE_URL;
  }

  private get model(): string {
    return this.config.model ?? DEFAULT_MODEL;
  }

  private tagToModelDef(tag: OllamaTagModel): ModelDef {
    const id = tag.name;
    const lower = id.toLowerCase();
    const isReasoning = lower.includes("r1") || lower.includes("reasoning") || lower.includes("think");
    return {
      id,
      name: id,
      provider: "ollama",
      api: "ollama-chat",
      reasoning: isReasoning,
      input: ["text"],
      contextWindow: 128000,
      maxOutputTokens: 8192,
      cost: { input: 0, output: 0 },
    };
  }

  private mapUsage(raw: { prompt_eval_count?: number; eval_count?: number }): TokenUsage | undefined {
    if (raw.prompt_eval_count == null && raw.eval_count == null) return undefined;
    const input = raw.prompt_eval_count ?? 0;
    const output = raw.eval_count ?? 0;
    return { inputTokens: input, outputTokens: output, totalTokens: input + output };
  }
}
