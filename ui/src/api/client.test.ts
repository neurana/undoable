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

describe("api.users", () => {
  it("list calls GET /api/users", async () => {
    mockFetch.mockResolvedValue(mockResponse([{ id: "u1" }]));
    const result = await api.users.list();
    expect(result).toEqual([{ id: "u1" }]);
  });

  it("create calls POST /api/users", async () => {
    mockFetch.mockResolvedValue(mockResponse({ id: "u2", apiKey: "key123" }));
    const result = await api.users.create("alice", "admin");
    expect(result.apiKey).toBe("key123");
  });

  it("delete calls DELETE /api/users/:id", async () => {
    mockFetch.mockResolvedValue(mockResponse({ deleted: true }));
    const result = await api.users.delete("u1");
    expect(result.deleted).toBe(true);
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
