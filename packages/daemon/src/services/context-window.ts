import type { ChatMessage } from "./chat-service.js";

const DEFAULT_MAX_TOKENS = 120_000;
const COMPACTION_THRESHOLD = 0.75;
const CHARS_PER_TOKEN = 3.5;

export type ContextWindowConfig = {
  maxTokens?: number;
  threshold?: number;
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function messageTokens(msg: ChatMessage): number {
  if ("content" in msg && typeof msg.content === "string") {
    return estimateTokens(msg.content) + 4;
  }
  if ("content" in msg && Array.isArray(msg.content)) {
    let total = 4;
    for (const block of msg.content) {
      if (block.type === "text") total += estimateTokens(block.text);
      else total += 85;
    }
    return total;
  }
  if (msg.role === "assistant" && msg.tool_calls) {
    let total = 4;
    for (const tc of msg.tool_calls) {
      total += estimateTokens(tc.function.name) + estimateTokens(tc.function.arguments);
    }
    return total;
  }
  return 4;
}

export function estimateConversationTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) total += messageTokens(msg);
  return total;
}

function buildCompactionPrompt(messages: ChatMessage[]): string {
  const userAssistant = messages.filter(
    (m) => m.role === "user" || (m.role === "assistant" && m.content),
  );
  const pairs: string[] = [];
  for (const m of userAssistant) {
    const content = typeof m.content === "string" ? m.content : "[media]";
    pairs.push(`[${m.role}]: ${content.slice(0, 500)}`);
  }
  return pairs.join("\n");
}

export function needsCompaction(
  messages: ChatMessage[],
  config?: ContextWindowConfig,
): boolean {
  const maxTokens = config?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const threshold = config?.threshold ?? COMPACTION_THRESHOLD;
  return estimateConversationTokens(messages) > maxTokens * threshold;
}

export function compactMessages(
  messages: ChatMessage[],
  config?: ContextWindowConfig,
): ChatMessage[] {
  const maxTokens = config?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const target = Math.floor(maxTokens * COMPACTION_THRESHOLD * 0.5);

  const system = messages[0]?.role === "system" ? messages[0] : null;
  const rest = system ? messages.slice(1) : [...messages];

  const summary = buildCompactionPrompt(rest);
  const compacted: ChatMessage = {
    role: "system",
    content: `[Conversation compacted — summary of prior ${rest.length} messages]\n${summary.slice(0, target * Math.floor(CHARS_PER_TOKEN))}`,
  };

  const keepCount = Math.min(rest.length, 10);
  const recent = rest.slice(-keepCount);

  const result: ChatMessage[] = [];
  if (system) result.push(system);
  result.push(compacted);
  result.push(...recent);
  return result;
}
