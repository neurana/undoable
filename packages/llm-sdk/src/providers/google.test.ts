import { describe, it, expect } from "vitest";
import { GoogleProvider } from "./google.js";

describe("GoogleProvider", () => {
  it("has correct id and name", () => {
    const provider = new GoogleProvider({ apiKey: "test" });
    expect(provider.id).toBe("google");
    expect(provider.name).toBe("Google Gemini");
  });

  it("lists known models with metadata", async () => {
    const provider = new GoogleProvider({ apiKey: "test" });
    const models = await provider.listModels!();
    expect(models.length).toBeGreaterThanOrEqual(5);

    const g3pro = models.find((m) => m.id === "gemini-3-pro-preview");
    expect(g3pro).toBeDefined();
    expect(g3pro!.provider).toBe("google");
    expect(g3pro!.api).toBe("google-generative-ai");
    expect(g3pro!.reasoning).toBe(true);
    expect(g3pro!.input).toContain("text");
    expect(g3pro!.input).toContain("image");
    expect(g3pro!.contextWindow).toBe(1048576);
    expect(g3pro!.maxOutputTokens).toBe(65536);
  });

  it("includes all model generations", async () => {
    const provider = new GoogleProvider({ apiKey: "test" });
    const models = await provider.listModels!();
    const ids = models.map((m) => m.id);

    expect(ids).toContain("gemini-3-pro-preview");
    expect(ids).toContain("gemini-3-flash-preview");
    expect(ids).toContain("gemini-2.5-pro");
    expect(ids).toContain("gemini-2.5-flash");
    expect(ids).toContain("gemini-2.0-flash");
  });

  it("resolves known model by id", () => {
    const provider = new GoogleProvider({ apiKey: "test" });
    const model = provider.resolveModel!("gemini-3-pro-preview");
    expect(model).toBeDefined();
    expect(model!.name).toBe("Gemini 3 Pro");
    expect(model!.reasoning).toBe(true);
  });

  it("returns undefined for unknown model", () => {
    const provider = new GoogleProvider({ apiKey: "test" });
    expect(provider.resolveModel!("nope")).toBeUndefined();
  });
});
