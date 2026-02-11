import { describe, it, expect } from "vitest";
import { AnthropicProvider } from "./anthropic.js";

describe("AnthropicProvider", () => {
  it("has correct id and name", () => {
    const provider = new AnthropicProvider({ apiKey: "test" });
    expect(provider.id).toBe("anthropic");
    expect(provider.name).toBe("Anthropic");
  });

  it("lists known models with full metadata", async () => {
    const provider = new AnthropicProvider({ apiKey: "test" });
    const models = await provider.listModels!();
    expect(models.length).toBeGreaterThanOrEqual(8);

    const opus46 = models.find((m) => m.id === "claude-opus-4-6");
    expect(opus46).toBeDefined();
    expect(opus46!.provider).toBe("anthropic");
    expect(opus46!.api).toBe("anthropic-messages");
    expect(opus46!.reasoning).toBe(true);
    expect(opus46!.input).toContain("text");
    expect(opus46!.input).toContain("image");
    expect(opus46!.contextWindow).toBe(200000);
    expect(opus46!.maxOutputTokens).toBe(32768);
  });

  it("includes all latest model generations", async () => {
    const provider = new AnthropicProvider({ apiKey: "test" });
    const models = await provider.listModels!();
    const ids = models.map((m) => m.id);

    expect(ids).toContain("claude-opus-4-6");
    expect(ids).toContain("claude-opus-4-5-20251101");
    expect(ids).toContain("claude-sonnet-4-5-20250929");
    expect(ids).toContain("claude-haiku-4-5-20251001");
    expect(ids).toContain("claude-opus-4-1-20250805");
    expect(ids).toContain("claude-sonnet-4-20250514");
  });

  it("identifies reasoning vs non-reasoning models", async () => {
    const provider = new AnthropicProvider({ apiKey: "test" });
    const models = await provider.listModels!();

    const opus46 = models.find((m) => m.id === "claude-opus-4-6");
    expect(opus46!.reasoning).toBe(true);

    const haiku45 = models.find((m) => m.id === "claude-haiku-4-5-20251001");
    expect(haiku45!.reasoning).toBe(true);

    const haiku35 = models.find((m) => m.id === "claude-3-5-haiku-20241022");
    expect(haiku35!.reasoning).toBe(false);
  });

  it("resolves known model by id", () => {
    const provider = new AnthropicProvider({ apiKey: "test" });
    const model = provider.resolveModel!("claude-opus-4-6");
    expect(model).toBeDefined();
    expect(model!.name).toBe("Claude Opus 4.6");
  });

  it("returns undefined for unknown model", () => {
    const provider = new AnthropicProvider({ apiKey: "test" });
    expect(provider.resolveModel!("claude-99")).toBeUndefined();
  });

  it("accepts thinkLevel config", () => {
    const provider = new AnthropicProvider({ apiKey: "test", thinkLevel: "high" });
    expect(provider.id).toBe("anthropic");
  });
});
