import { describe, it, expect } from "vitest";
import { HttpAdapter } from "./http-adapter.js";

const adapter = new HttpAdapter();

describe("HttpAdapter", () => {
  it("has correct id and prefix", () => {
    expect(adapter.id).toBe("http");
    expect(adapter.requiredCapabilityPrefix).toBe("http.request");
  });

  it("returns error for invalid URL", async () => {
    const result = await adapter.execute({
      runId: "r1",
      stepId: "s1",
      params: { url: "not-a-url" },
      workingDir: "/tmp",
      capabilities: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid URL");
  });

  describe("validate", () => {
    it("returns true for valid params", () => {
      expect(adapter.validate({ url: "https://example.com" })).toBe(true);
    });

    it("returns false for missing url", () => {
      expect(adapter.validate({ method: "GET" })).toBe(false);
    });
  });

  describe("estimateCapabilities", () => {
    it("returns method:host:path for valid URL", () => {
      const caps = adapter.estimateCapabilities({ url: "https://api.github.com/repos", method: "GET" });
      expect(caps).toEqual(["http.request:GET:api.github.com/repos"]);
    });

    it("defaults to GET method", () => {
      const caps = adapter.estimateCapabilities({ url: "https://example.com/api" });
      expect(caps).toEqual(["http.request:GET:example.com/api"]);
    });

    it("returns wildcard for invalid URL", () => {
      const caps = adapter.estimateCapabilities({ url: "bad", method: "POST" });
      expect(caps).toEqual(["http.request:POST:*"]);
    });
  });
});
