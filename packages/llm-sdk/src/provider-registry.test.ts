import { describe, it, expect, beforeEach } from "vitest";
import { LLMProviderRegistry } from "./provider-registry.js";
import type { LLMProvider, LLMResult } from "./types.js";

function mockProvider(id: string): LLMProvider {
  return {
    id,
    name: `Mock ${id}`,
    generatePlan: async () => ({ plan: {}, model: "mock", provider: id, durationMs: 0 } as LLMResult),
  };
}

let registry: LLMProviderRegistry;

beforeEach(() => {
  registry = new LLMProviderRegistry();
});

describe("LLMProviderRegistry", () => {
  describe("register", () => {
    it("registers a provider", () => {
      registry.register(mockProvider("openai"));
      expect(registry.has("openai")).toBe(true);
    });

    it("throws on duplicate registration", () => {
      registry.register(mockProvider("openai"));
      expect(() => registry.register(mockProvider("openai"))).toThrow("already registered");
    });
  });

  describe("get", () => {
    it("returns registered provider", () => {
      registry.register(mockProvider("openai"));
      expect(registry.get("openai").id).toBe("openai");
    });

    it("throws for unknown provider", () => {
      expect(() => registry.get("nope")).toThrow("not found");
    });
  });

  describe("getDefault", () => {
    it("returns first registered provider as default", () => {
      registry.register(mockProvider("openai"));
      registry.register(mockProvider("anthropic"));
      expect(registry.getDefault().id).toBe("openai");
    });

    it("throws when no providers registered", () => {
      expect(() => registry.getDefault()).toThrow("No LLM providers");
    });
  });

  describe("setDefault", () => {
    it("changes the default provider", () => {
      registry.register(mockProvider("openai"));
      registry.register(mockProvider("anthropic"));
      registry.setDefault("anthropic");
      expect(registry.getDefault().id).toBe("anthropic");
    });

    it("throws for unknown provider", () => {
      expect(() => registry.setDefault("nope")).toThrow("not found");
    });
  });

  describe("resolve", () => {
    it("resolves by config provider", () => {
      registry.register(mockProvider("openai"));
      registry.register(mockProvider("anthropic"));
      expect(registry.resolve({ provider: "anthropic" }).id).toBe("anthropic");
    });

    it("resolves to default when no config", () => {
      registry.register(mockProvider("openai"));
      expect(registry.resolve().id).toBe("openai");
    });
  });

  describe("list", () => {
    it("lists all providers", () => {
      registry.register(mockProvider("openai"));
      registry.register(mockProvider("anthropic"));
      expect(registry.list()).toHaveLength(2);
    });
  });

  describe("has", () => {
    it("returns true for registered", () => {
      registry.register(mockProvider("openai"));
      expect(registry.has("openai")).toBe(true);
    });

    it("returns false for unregistered", () => {
      expect(registry.has("nope")).toBe(false);
    });
  });
});
