/**
 * Thinking mode support for Undoable.
 *
 * Inspired by OpenClaw's thinking architecture, adapted for Undoable's
 * OpenAI-compatible API approach.
 *
 * Provider differentiation:
 * - OpenAI (GPT-5 family, o-series): native `reasoning_effort` param
 * - Anthropic (via OpenAI-compat proxy): `reasoning_effort` or provider-specific
 * - Ollama / local models: <think> tags in text stream
 * - DeepSeek V3.2/R1: <think> tags in text stream
 */

export type ThinkLevel = "off" | "low" | "medium" | "high";

export type ReasoningVisibility = "off" | "on" | "stream";

export type ThinkingConfig = {
  level: ThinkLevel;
  visibility: ReasoningVisibility;
};

export const DEFAULT_THINKING_CONFIG: ThinkingConfig = {
  level: "off",
  visibility: "off",
};

// Models known to support native reasoning_effort parameter
const REASONING_EFFORT_MODELS = new Set([
  "gpt-5", "gpt-5-mini", "gpt-5-nano",
  "gpt-5.1", "gpt-5.2", "gpt-5.2-pro",
  "o1", "o1-mini", "o1-preview",
  "o3", "o3-mini", "o3-pro",
  "o4-mini",
]);

// Providers that use <think> tags in text stream
const TAG_REASONING_PROVIDERS = new Set([
  "ollama",
  "deepseek",
  "local",
]);

/**
 * Check if a model supports the OpenAI `reasoning_effort` parameter.
 */
export function supportsReasoningEffort(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  for (const known of REASONING_EFFORT_MODELS) {
    if (normalized.startsWith(known)) return true;
  }
  return false;
}

/**
 * Check if a provider uses <think> tags in the text stream.
 */
export function isTagReasoningProvider(provider: string): boolean {
  const normalized = provider.trim().toLowerCase();
  return TAG_REASONING_PROVIDERS.has(normalized);
}

/**
 * Map ThinkLevel to OpenAI reasoning_effort value.
 */
export function mapToReasoningEffort(level: ThinkLevel): string | undefined {
  if (level === "off") return undefined;
  return level; // "low" | "medium" | "high" map directly
}

/**
 * Normalize user-provided thinking level strings.
 */
export function normalizeThinkLevel(raw?: string | null): ThinkLevel | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  if (["off", "false", "no", "0", "disable", "disabled"].includes(key)) return "off";
  if (["low", "on", "enable", "enabled", "true", "yes", "1", "minimal", "min"].includes(key)) return "low";
  if (["medium", "med", "mid", "moderate"].includes(key)) return "medium";
  if (["high", "max", "ultra", "full"].includes(key)) return "high";
  return undefined;
}

// ── <think> tag parsing ──

type ThinkBlock =
  | { type: "thinking"; content: string }
  | { type: "text"; content: string };

/**
 * Split text containing <think>...</think> tags into blocks.
 * Returns null if no thinking tags found.
 */
export function splitThinkingTags(text: string): ThinkBlock[] | null {
  const openRe = /<\s*think(?:ing)?\s*>/gi;

  if (!openRe.test(text)) return null;
  // Reset lastIndex after test
  openRe.lastIndex = 0;

  const scanRe = /<\s*(\/?)\s*think(?:ing)?\s*>/gi;
  let inThinking = false;
  let cursor = 0;
  let thinkStart = 0;
  const blocks: ThinkBlock[] = [];

  for (const match of text.matchAll(scanRe)) {
    const index = match.index ?? 0;
    const isClose = Boolean(match[1]?.includes("/"));

    if (!inThinking && !isClose) {
      const before = text.slice(cursor, index).trim();
      if (before) blocks.push({ type: "text", content: before });
      thinkStart = index + match[0].length;
      inThinking = true;
    } else if (inThinking && isClose) {
      const thinking = text.slice(thinkStart, index).trim();
      if (thinking) blocks.push({ type: "thinking", content: thinking });
      cursor = index + match[0].length;
      inThinking = false;
    }
  }

  // If still in thinking (unclosed tag), treat rest as thinking
  if (inThinking) {
    const thinking = text.slice(thinkStart).trim();
    if (thinking) blocks.push({ type: "thinking", content: thinking });
  } else {
    const after = text.slice(cursor).trim();
    if (after) blocks.push({ type: "text", content: after });
  }

  const hasThinking = blocks.some((b) => b.type === "thinking");
  return hasThinking ? blocks : null;
}

/**
 * Extract thinking content from a partial stream (may have unclosed tags).
 */
export function extractThinkingFromStream(text: string): string {
  if (!text) return "";

  const openRe = /<\s*think(?:ing)?\s*>/gi;
  const closeRe = /<\s*\/\s*think(?:ing)?\s*>/gi;

  const openMatches = [...text.matchAll(openRe)];
  if (openMatches.length === 0) return "";

  const closeMatches = [...text.matchAll(closeRe)];

  // If we have a closed block, extract it
  if (closeMatches.length > 0) {
    const blocks = splitThinkingTags(text);
    if (blocks) {
      return blocks
        .filter((b) => b.type === "thinking")
        .map((b) => b.content)
        .join("\n");
    }
  }

  // Unclosed tag — return content after last open tag
  const lastOpen = openMatches[openMatches.length - 1]!;
  const start = (lastOpen.index ?? 0) + lastOpen[0].length;
  return text.slice(start).trim();
}

/**
 * Strip <think>...</think> tags from text, returning only visible content.
 */
export function stripThinkingTags(text: string): string {
  const blocks = splitThinkingTags(text);
  if (!blocks) return text;
  return blocks
    .filter((b) => b.type === "text")
    .map((b) => b.content)
    .join("\n")
    .trim();
}
