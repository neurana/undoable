import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, streamEvents } from "./client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });

function mockResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, statusText: ok ? "OK" : "Error", json: () => Promise.resolve(data) };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("api.runs", () => {
  it("list calls GET /api/runs", async () => {
    mockFetch.mockResolvedValue(mockResponse([{ id: "r1" }]));
    const result = await api.runs.list();
    expect(result).toEqual([{ id: "r1" }]);
    expect(mockFetch).toHaveBeenCalledWith("/api/runs", expect.objectContaining({ headers: expect.any(Object) }));
  });

  it("get calls GET /api/runs/:id", async () => {
    mockFetch.mockResolvedValue(mockResponse({ id: "r1", status: "created" }));
    const result = await api.runs.get("r1");
    expect(result.id).toBe("r1");
  });

  it("create calls POST /api/runs", async () => {
    mockFetch.mockResolvedValue(mockResponse({ id: "r2" }));
    const result = await api.runs.create("fix bug");
    expect(result.id).toBe("r2");
    expect(mockFetch).toHaveBeenCalledWith("/api/runs", expect.objectContaining({ method: "POST" }));
  });

  it("action calls POST /api/runs/:id/:action", async () => {
    mockFetch.mockResolvedValue(mockResponse({ id: "r1", status: "applying" }));
    const result = await api.runs.action("r1", "apply");
    expect(result.status).toBe("applying");
  });

  it("delete calls DELETE /api/runs/:id", async () => {
    mockFetch.mockResolvedValue(mockResponse({ deleted: true }));
    const result = await api.runs.delete("r1");
    expect(result.deleted).toBe(true);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue(mockResponse({ error: "not found" }, false, 404));
    await expect(api.runs.get("nope")).rejects.toThrow("not found");
  });
});

describe("api.agents", () => {
  it("list calls GET /api/agents", async () => {
    mockFetch.mockResolvedValue(mockResponse([{ id: "default" }]));
    const result = await api.agents.list();
    expect(result).toEqual([{ id: "default" }]);
  });

  it("get calls GET /api/agents/:id", async () => {
    mockFetch.mockResolvedValue(mockResponse({ id: "default", model: "gpt-4o" }));
    const result = await api.agents.get("default");
    expect(result.model).toBe("gpt-4o");
  });
});

describe("api.jobs", () => {
  it("history undo calls POST /api/jobs/history/undo", async () => {
    mockFetch.mockResolvedValue(mockResponse({
      ok: true,
      result: { ok: true, kind: "create", label: "Created job \"x\"" },
      status: { undoCount: 0, redoCount: 1 },
    }));

    const result = await api.jobs.undo();
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/jobs/history/undo",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("api.health", () => {
  it("status calls GET /api/health", async () => {
    mockFetch.mockResolvedValue(mockResponse({ status: "ok", ready: true, version: "0.1.0", uptime: 1, checks: {} }));
    const result = await api.health.status();
    expect(result.ready).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith("/api/health", expect.objectContaining({ headers: expect.any(Object) }));
  });
});

describe("api.settings.operation", () => {
  it("update calls PATCH /api/control/operation", async () => {
    mockFetch.mockResolvedValue(mockResponse({ mode: "drain", reason: "maintenance", updatedAt: "2026-02-20T00:00:00.000Z" }));
    const result = await api.settings.operation.update("drain", "maintenance");
    expect(result.mode).toBe("drain");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/control/operation",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ mode: "drain", reason: "maintenance" }),
      }),
    );
  });
});

describe("api.gateway", () => {
  it("tts.status calls gateway RPC", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, result: { enabled: true, provider: "system", providers: ["system"] } }));
    const result = await api.gateway.tts.status();
    expect(result.enabled).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/gateway",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ method: "tts.status", params: {} }),
      }),
    );
  });

  it("agents.files.set calls gateway RPC with content", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, result: { agentId: "a1", path: "instructions.md", version: 2 } }));
    const result = await api.gateway.agentsFiles.set("a1", "hello", "summary");
    expect(result.version).toBe(2);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/gateway",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          method: "agents.files.set",
          params: { agentId: "a1", path: "instructions.md", content: "hello", summary: "summary" },
        }),
      }),
    );
  });

  it("browser.tabs calls gateway browser.request tabs action", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, result: { tabs: [{ index: 0, url: "https://example.com", title: "Example", active: true }] } }));
    const result = await api.gateway.browser.tabs();
    expect(result.tabs[0]?.url).toBe("https://example.com");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/gateway",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ method: "browser.request", params: { action: "tabs" } }),
      }),
    );
  });

  it("browser.navigate calls gateway browser.request navigate action", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, result: { message: "Navigated" } }));
    const result = await api.gateway.browser.navigate("https://example.com");
    expect(result.message).toContain("Navigated");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/gateway",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          method: "browser.request",
          params: { action: "navigate", url: "https://example.com" },
        }),
      }),
    );
  });
});

describe("streamEvents", () => {
  it("creates EventSource and returns cleanup function", () => {
    const closeFn = vi.fn();
    vi.stubGlobal("EventSource", class {
      onmessage: ((e: unknown) => void) | null = null;
      close = closeFn;
    });

    const unsub = streamEvents("r1", () => {});
    expect(typeof unsub).toBe("function");
    unsub();
    expect(closeFn).toHaveBeenCalled();
  });
});
