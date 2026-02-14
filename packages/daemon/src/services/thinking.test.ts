import { describe, it, expect } from "vitest";
import {
  normalizeThinkLevel,
  supportsReasoningEffort,
  isTagReasoningProvider,
  mapToReasoningEffort,
  splitThinkingTags,
  extractThinkingFromStream,
  stripThinkingTags,
} from "./thinking.js";

describe("normalizeThinkLevel", () => {
  it("returns undefined for empty input", () => {
    expect(normalizeThinkLevel()).toBeUndefined();
    expect(normalizeThinkLevel(null)).toBeUndefined();
    expect(normalizeThinkLevel("")).toBeUndefined();
  });

  it("normalizes off variants", () => {
    expect(normalizeThinkLevel("off")).toBe("off");
    expect(normalizeThinkLevel("false")).toBe("off");
    expect(normalizeThinkLevel("no")).toBe("off");
    expect(normalizeThinkLevel("0")).toBe("off");
    expect(normalizeThinkLevel("disable")).toBe("off");
  });

  it("normalizes low variants", () => {
    expect(normalizeThinkLevel("low")).toBe("low");
    expect(normalizeThinkLevel("on")).toBe("low");
    expect(normalizeThinkLevel("enable")).toBe("low");
    expect(normalizeThinkLevel("true")).toBe("low");
    expect(normalizeThinkLevel("yes")).toBe("low");
    expect(normalizeThinkLevel("minimal")).toBe("low");
  });

  it("normalizes medium variants", () => {
    expect(normalizeThinkLevel("medium")).toBe("medium");
    expect(normalizeThinkLevel("med")).toBe("medium");
    expect(normalizeThinkLevel("mid")).toBe("medium");
    expect(normalizeThinkLevel("moderate")).toBe("medium");
  });

  it("normalizes high variants", () => {
    expect(normalizeThinkLevel("high")).toBe("high");
    expect(normalizeThinkLevel("max")).toBe("high");
    expect(normalizeThinkLevel("ultra")).toBe("high");
    expect(normalizeThinkLevel("full")).toBe("high");
  });

  it("returns undefined for unrecognized values", () => {
    expect(normalizeThinkLevel("xhigh")).toBeUndefined();
    expect(normalizeThinkLevel("turbo")).toBeUndefined();
    expect(normalizeThinkLevel("random")).toBeUndefined();
  });

  it("trims and is case-insensitive", () => {
    expect(normalizeThinkLevel("  HIGH  ")).toBe("high");
    expect(normalizeThinkLevel("Medium")).toBe("medium");
  });
});

describe("supportsReasoningEffort", () => {
  it("returns true for o-series models", () => {
    expect(supportsReasoningEffort("o1")).toBe(true);
    expect(supportsReasoningEffort("o1-mini")).toBe(true);
    expect(supportsReasoningEffort("o1-preview")).toBe(true);
    expect(supportsReasoningEffort("o3")).toBe(true);
    expect(supportsReasoningEffort("o3-mini")).toBe(true);
    expect(supportsReasoningEffort("o3-pro")).toBe(true);
    expect(supportsReasoningEffort("o4-mini")).toBe(true);
  });

  it("returns true for GPT-5 family models", () => {
    expect(supportsReasoningEffort("gpt-5")).toBe(true);
    expect(supportsReasoningEffort("gpt-5-mini")).toBe(true);
    expect(supportsReasoningEffort("gpt-5-nano")).toBe(true);
    expect(supportsReasoningEffort("gpt-5.1")).toBe(true);
    expect(supportsReasoningEffort("gpt-5.2")).toBe(true);
    expect(supportsReasoningEffort("gpt-5.2-pro")).toBe(true);
  });

  it("returns false for non-reasoning models", () => {
    expect(supportsReasoningEffort("gpt-4")).toBe(false);
    expect(supportsReasoningEffort("gpt-4o")).toBe(false);
    expect(supportsReasoningEffort("gpt-4.1")).toBe(false);
    expect(supportsReasoningEffort("gpt-4.1-mini")).toBe(false);
    expect(supportsReasoningEffort("claude-3.5-sonnet")).toBe(false);
    expect(supportsReasoningEffort("llama-3")).toBe(false);
  });
});

describe("isTagReasoningProvider", () => {
  it("returns true for tag-based providers", () => {
    expect(isTagReasoningProvider("ollama")).toBe(true);
    expect(isTagReasoningProvider("deepseek")).toBe(true);
    expect(isTagReasoningProvider("local")).toBe(true);
  });

  it("returns false for native providers", () => {
    expect(isTagReasoningProvider("openai")).toBe(false);
    expect(isTagReasoningProvider("anthropic")).toBe(false);
  });

  it("is case-insensitive and trims", () => {
    expect(isTagReasoningProvider("  Ollama  ")).toBe(true);
    expect(isTagReasoningProvider("DEEPSEEK")).toBe(true);
  });
});

describe("mapToReasoningEffort", () => {
  it("returns undefined for off", () => {
    expect(mapToReasoningEffort("off")).toBeUndefined();
  });

  it("passes through low/medium/high", () => {
    expect(mapToReasoningEffort("low")).toBe("low");
    expect(mapToReasoningEffort("medium")).toBe("medium");
    expect(mapToReasoningEffort("high")).toBe("high");
  });
});

describe("splitThinkingTags", () => {
  it("returns null when no think tags present", () => {
    expect(splitThinkingTags("Hello world")).toBeNull();
    expect(splitThinkingTags("No thinking here")).toBeNull();
  });

  it("splits basic think tags", () => {
    const text = "<think>reasoning here</think>visible answer";
    const blocks = splitThinkingTags(text);
    expect(blocks).toEqual([
      { type: "thinking", content: "reasoning here" },
      { type: "text", content: "visible answer" },
    ]);
  });

  it("handles <thinking> variant", () => {
    const text = "<thinking>my thoughts</thinking>the answer";
    const blocks = splitThinkingTags(text);
    expect(blocks).toEqual([
      { type: "thinking", content: "my thoughts" },
      { type: "text", content: "the answer" },
    ]);
  });

  it("handles text before and after", () => {
    const text = "prefix <think>thinking</think> suffix";
    const blocks = splitThinkingTags(text);
    expect(blocks).toEqual([
      { type: "text", content: "prefix" },
      { type: "thinking", content: "thinking" },
      { type: "text", content: "suffix" },
    ]);
  });

  it("handles multiple think blocks", () => {
    const text = "<think>first</think>middle<think>second</think>end";
    const blocks = splitThinkingTags(text);
    expect(blocks).toEqual([
      { type: "thinking", content: "first" },
      { type: "text", content: "middle" },
      { type: "thinking", content: "second" },
      { type: "text", content: "end" },
    ]);
  });

  it("handles unclosed think tag", () => {
    const text = "<think>still thinking...";
    const blocks = splitThinkingTags(text);
    expect(blocks).toEqual([
      { type: "thinking", content: "still thinking..." },
    ]);
  });

  it("handles whitespace in tags", () => {
    const text = "< think >reasoning</ think >answer";
    const blocks = splitThinkingTags(text);
    expect(blocks).toEqual([
      { type: "thinking", content: "reasoning" },
      { type: "text", content: "answer" },
    ]);
  });
});

describe("extractThinkingFromStream", () => {
  it("returns empty for no think tags", () => {
    expect(extractThinkingFromStream("hello world")).toBe("");
    expect(extractThinkingFromStream("")).toBe("");
  });

  it("extracts from closed think block", () => {
    expect(extractThinkingFromStream("<think>reasoning</think>answer")).toBe("reasoning");
  });

  it("extracts from unclosed think block (streaming)", () => {
    expect(extractThinkingFromStream("<think>partial reasoning")).toBe("partial reasoning");
  });

  it("extracts from multiple blocks", () => {
    expect(extractThinkingFromStream("<think>first</think>mid<think>second</think>end")).toBe("first\nsecond");
  });
});

describe("stripThinkingTags", () => {
  it("returns text unchanged when no tags", () => {
    expect(stripThinkingTags("hello world")).toBe("hello world");
  });

  it("strips thinking blocks", () => {
    expect(stripThinkingTags("<think>reasoning</think>visible answer")).toBe("visible answer");
  });

  it("strips multiple thinking blocks", () => {
    expect(stripThinkingTags("<think>a</think>first<think>b</think>second")).toBe("first\nsecond");
  });

  it("preserves text around thinking", () => {
    expect(stripThinkingTags("before <think>thinking</think> after")).toBe("before\nafter");
  });
});
