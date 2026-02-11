import type { LLMProvider, LLMContext, LLMStreamEvent, LLMResult, ModelDef, TokenUsage } from "../types.js";
import { buildSystemPrompt, buildUserPrompt } from "../system-prompt.js";
import { parsePlanFromRaw } from "../stream-parsers.js";

export type GoogleConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
};

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const GOOGLE_MODELS: ModelDef[] = [
  { id: "gemini-3-pro-preview", name: "Gemini 3 Pro", provider: "google", api: "google-generative-ai", reasoning: true, input: ["text", "image"], contextWindow: 1048576, maxOutputTokens: 65536 },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", provider: "google", api: "google-generative-ai", reasoning: true, input: ["text", "image"], contextWindow: 1048576, maxOutputTokens: 65536 },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", api: "google-generative-ai", reasoning: true, input: ["text", "image"], contextWindow: 1048576, maxOutputTokens: 65536 },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google", api: "google-generative-ai", reasoning: true, input: ["text", "image"], contextWindow: 1048576, maxOutputTokens: 65536 },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "google", api: "google-generative-ai", reasoning: false, input: ["text", "image"], contextWindow: 1048576, maxOutputTokens: 8192 },
];

export class GoogleProvider implements LLMProvider {
  readonly id = "google";
  readonly name = "Google Gemini";

  private config: GoogleConfig;

  constructor(config: GoogleConfig) {
    this.config = config;
  }

  async generatePlan(context: LLMContext): Promise<LLMResult> {
    const start = Date.now();
    const body = this.buildRequestBody(context);
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: context.abortSignal,
    });

    if (!res.ok) {
      throw new Error(`Google API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      candidates: Array<{ content: { parts: Array<{ text?: string }> }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
    };
    const parts = data.candidates[0]?.content.parts ?? [];
    const content = parts.map((p) => p.text ?? "").join("");
    const plan = parsePlanFromRaw(content);
    const usage = data.usageMetadata ? this.mapUsage(data.usageMetadata) : undefined;

    return {
      plan,
      usage,
      model: this.model,
      provider: this.id,
      durationMs: Date.now() - start,
      finishReason: data.candidates[0]?.finishReason,
    };
  }

  async *streamPlan(context: LLMContext): AsyncIterable<LLMStreamEvent> {
    const body = this.buildRequestBody(context);
    const url = `${this.baseUrl}/models/${this.model}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: context.abortSignal,
    });

    if (!res.ok) {
      yield { type: "error", error: `Google API error: ${res.status} ${res.statusText}` };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";

      for (const line of parts) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        try {
          const parsed = JSON.parse(data) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
          };
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullContent += text;
            yield { type: "token", content: text };
          }
          if (parsed.usageMetadata) {
            yield { type: "usage", usage: this.mapUsage(parsed.usageMetadata) };
          }
        } catch {
          continue;
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
    return GOOGLE_MODELS;
  }

  resolveModel(modelId: string): ModelDef | undefined {
    return GOOGLE_MODELS.find((m) => m.id === modelId);
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? DEFAULT_BASE_URL;
  }

  private get model(): string {
    return this.config.model ?? DEFAULT_MODEL;
  }

  private buildRequestBody(context: LLMContext) {
    return {
      systemInstruction: { parts: [{ text: buildSystemPrompt(context) }] },
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(context.instruction) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: this.config.maxTokens ?? 16384,
      },
    };
  }

  private mapUsage(raw: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number }): TokenUsage {
    return {
      inputTokens: raw.promptTokenCount,
      outputTokens: raw.candidatesTokenCount,
      totalTokens: raw.totalTokenCount,
    };
  }
}
