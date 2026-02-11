import { describe, it, expect } from "vitest";
import { OpenAIProvider } from "./openai.js";

describe("OpenAIProvider", () => {
  it("has correct id and name", () => {
    const provider = new OpenAIProvider({ apiKey: "test" });
    expect(provider.id).toBe("openai");
    expect(provider.name).toBe("OpenAI");
  });

  it("lists known models with full metadata", async () => {
    const provider = new OpenAIProvider({ apiKey: "test" });
    const models = await provider.listModels!();
    expect(models.length).toBeGreaterThanOrEqual(14);

    const gpt52 = models.find((m) => m.id === "gpt-5.2");
    expect(gpt52).toBeDefined();
    expect(gpt52!.provider).toBe("openai");
    expect(gpt52!.reasoning).toBe(true);
    expect(gpt52!.input).toContain("text");
    expect(gpt52!.input).toContain("image");
    expect(gpt52!.contextWindow).toBe(400000);
    expect(gpt52!.maxOutputTokens).toBe(32768);
  });

  it("identifies reasoning vs non-reasoning models", async () => {
    const provider = new OpenAIProvider({ apiKey: "test" });
    const models = await provider.listModels!();

    const gpt52 = models.find((m) => m.id === "gpt-5.2");
    expect(gpt52!.reasoning).toBe(true);

    const o3pro = models.find((m) => m.id === "o3-pro");
    expect(o3pro!.reasoning).toBe(true);

    const gpt41 = models.find((m) => m.id === "gpt-4.1");
    expect(gpt41!.reasoning).toBe(false);

    const gpt4o = models.find((m) => m.id === "gpt-4o");
    expect(gpt4o!.reasoning).toBe(false);
  });

  it("resolves known model by id", () => {
    const provider = new OpenAIProvider({ apiKey: "test" });
    const model = provider.resolveModel!("gpt-5.2-codex");
    expect(model).toBeDefined();
    expect(model!.name).toBe("GPT-5.2 Codex");
    expect(model!.reasoning).toBe(true);
  });

  it("returns undefined for unknown model", () => {
    const provider = new OpenAIProvider({ apiKey: "test" });
    expect(provider.resolveModel!("gpt-99")).toBeUndefined();
  });
});
