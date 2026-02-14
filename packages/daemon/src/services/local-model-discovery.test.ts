import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LocalModelDiscovery } from "./local-model-discovery.js";

const OLLAMA_TAGS_RESPONSE = {
  models: [
    { name: "llama3.3:latest", modified_at: "2025-01-01T00:00:00Z", size: 4_000_000_000, digest: "abc123", details: { family: "llama", parameter_size: "70B" } },
    { name: "deepseek-r1:8b", modified_at: "2025-01-01T00:00:00Z", size: 5_000_000_000, digest: "def456", details: { family: "deepseek", parameter_size: "8B" } },
    { name: "qwen3:8b", modified_at: "2025-01-01T00:00:00Z", size: 5_000_000_000, digest: "ghi789" },
  ],
};

const LMSTUDIO_MODELS_RESPONSE = {
  data: [
    { id: "mistral-7b-instruct-v0.3", object: "model", owned_by: "lmstudio" },
    { id: "llava-1.6-mistral-7b", object: "model", owned_by: "lmstudio" },
  ],
};

describe("LocalModelDiscovery", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("discovers Ollama models when server is reachable", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("11434/api/tags")) {
        return new Response(JSON.stringify(OLLAMA_TAGS_RESPONSE), { status: 200 });
      }
      if (u.includes("1234/v1/models")) {
        return new Response("", { status: 502 });
      }
      return new Response("", { status: 404 });
    });

    const discovery = new LocalModelDiscovery();
    await discovery.refresh();

    const models = discovery.getModels("ollama");
    expect(models.length).toBe(3);
    expect(models[0]!.id).toBe("llama3.3:latest");
    expect(models[0]!.local).toBe(true);
    expect(models[0]!.provider).toBe("ollama");
    expect(models[0]!.family).toBe("llama");
    expect(models[0]!.parameterSize).toBe("70B");
  });

  it("discovers LM Studio models when server is reachable", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("11434")) {
        throw new Error("Connection refused");
      }
      if (u.includes("1234/v1/models")) {
        return new Response(JSON.stringify(LMSTUDIO_MODELS_RESPONSE), { status: 200 });
      }
      return new Response("", { status: 404 });
    });

    const discovery = new LocalModelDiscovery();
    await discovery.refresh();

    const models = discovery.getModels("lmstudio");
    expect(models.length).toBe(2);
    expect(models[0]!.id).toBe("mistral-7b-instruct-v0.3");
    expect(models[0]!.provider).toBe("lmstudio");
    expect(models[0]!.local).toBe(true);
  });

  it("returns empty when servers are unreachable", async () => {
    fetchSpy.mockImplementation(async () => {
      throw new Error("Connection refused");
    });

    const discovery = new LocalModelDiscovery();
    await discovery.refresh();

    expect(discovery.getModels()).toHaveLength(0);
    expect(discovery.isAvailable("ollama")).toBe(false);
    expect(discovery.isAvailable("lmstudio")).toBe(false);
  });

  it("reports server status correctly", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("11434/api/tags")) {
        return new Response(JSON.stringify(OLLAMA_TAGS_RESPONSE), { status: 200 });
      }
      if (u.includes("1234")) {
        throw new Error("Connection refused");
      }
      return new Response("", { status: 404 });
    });

    const discovery = new LocalModelDiscovery();
    await discovery.refresh();

    const status = discovery.getServerStatus();
    expect(status).toHaveLength(2);

    const ollama = status.find((s) => s.provider === "ollama")!;
    expect(ollama.available).toBe(true);
    expect(ollama.modelCount).toBe(3);

    const lmstudio = status.find((s) => s.provider === "lmstudio")!;
    expect(lmstudio.available).toBe(false);
    expect(lmstudio.modelCount).toBe(0);
  });

  it("infers capabilities from model names", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("11434/api/tags")) {
        return new Response(JSON.stringify(OLLAMA_TAGS_RESPONSE), { status: 200 });
      }
      if (u.includes("1234")) throw new Error("Connection refused");
      return new Response("", { status: 404 });
    });

    const discovery = new LocalModelDiscovery();
    await discovery.refresh();

    const models = discovery.getModels("ollama");
    const r1 = models.find((m) => m.id === "deepseek-r1:8b")!;
    expect(r1.capabilities.thinking).toBe(true);
    expect(r1.capabilities.tagReasoning).toBe(true);
    expect(r1.capabilities.tools).toBe(false);

    const llama = models.find((m) => m.id === "llama3.3:latest")!;
    expect(llama.capabilities.thinking).toBe(false);
    expect(llama.capabilities.tools).toBe(true);
  });

  it("resolveProvider finds correct provider for model", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("11434/api/tags")) {
        return new Response(JSON.stringify(OLLAMA_TAGS_RESPONSE), { status: 200 });
      }
      if (u.includes("1234/v1/models")) {
        return new Response(JSON.stringify(LMSTUDIO_MODELS_RESPONSE), { status: 200 });
      }
      return new Response("", { status: 404 });
    });

    const discovery = new LocalModelDiscovery();
    await discovery.refresh();

    expect(discovery.resolveProvider("llama3.3:latest")).toBe("ollama");
    expect(discovery.resolveProvider("mistral-7b-instruct-v0.3")).toBe("lmstudio");
    expect(discovery.resolveProvider("gpt-4o")).toBeNull();
  });

  it("isLocalProvider checks correctly", () => {
    const discovery = new LocalModelDiscovery();
    expect(discovery.isLocalProvider("ollama")).toBe(true);
    expect(discovery.isLocalProvider("lmstudio")).toBe(true);
    expect(discovery.isLocalProvider("openai")).toBe(false);
  });

  it("getModels returns all when no provider specified", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("11434/api/tags")) {
        return new Response(JSON.stringify(OLLAMA_TAGS_RESPONSE), { status: 200 });
      }
      if (u.includes("1234/v1/models")) {
        return new Response(JSON.stringify(LMSTUDIO_MODELS_RESPONSE), { status: 200 });
      }
      return new Response("", { status: 404 });
    });

    const discovery = new LocalModelDiscovery();
    await discovery.refresh();

    const all = discovery.getModels();
    expect(all.length).toBe(5);
  });

  it("vision models detected from name", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("11434")) throw new Error("Connection refused");
      if (u.includes("1234/v1/models")) {
        return new Response(JSON.stringify(LMSTUDIO_MODELS_RESPONSE), { status: 200 });
      }
      return new Response("", { status: 404 });
    });

    const discovery = new LocalModelDiscovery();
    await discovery.refresh();

    const llava = discovery.getModels("lmstudio").find((m) => m.id.includes("llava"))!;
    expect(llava.capabilities.vision).toBe(true);
  });
});
