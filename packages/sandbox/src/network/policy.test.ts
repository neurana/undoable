import { describe, it, expect } from "vitest";
import { resolveNetworkMode, isHostAllowed } from "./policy.js";
import type { NetworkPolicy } from "./policy.js";

describe("resolveNetworkMode", () => {
  it("returns 'none' for none policy", () => {
    const policy: NetworkPolicy = { mode: "none" };
    expect(resolveNetworkMode(policy)).toBe("none");
  });

  it("returns 'bridge' for open policy", () => {
    const policy: NetworkPolicy = { mode: "open" };
    expect(resolveNetworkMode(policy)).toBe("bridge");
  });

  it("returns 'bridge' for restricted policy", () => {
    const policy: NetworkPolicy = { mode: "restricted", allowedHosts: ["api.github.com"] };
    expect(resolveNetworkMode(policy)).toBe("bridge");
  });
});

describe("isHostAllowed", () => {
  it("allows exact match", () => {
    expect(isHostAllowed("api.github.com", ["api.github.com"])).toBe(true);
  });

  it("rejects non-matching host", () => {
    expect(isHostAllowed("evil.com", ["api.github.com"])).toBe(false);
  });

  it("allows wildcard *", () => {
    expect(isHostAllowed("anything.com", ["*"])).toBe(true);
  });

  it("allows subdomain wildcard *.example.com", () => {
    expect(isHostAllowed("api.example.com", ["*.example.com"])).toBe(true);
  });

  it("allows root domain for subdomain wildcard", () => {
    expect(isHostAllowed("example.com", ["*.example.com"])).toBe(true);
  });

  it("rejects unrelated domain for subdomain wildcard", () => {
    expect(isHostAllowed("evil.com", ["*.example.com"])).toBe(false);
  });

  it("allows deeply nested subdomain", () => {
    expect(isHostAllowed("a.b.c.example.com", ["*.example.com"])).toBe(true);
  });

  it("checks multiple patterns", () => {
    const allowed = ["api.github.com", "*.npmjs.org"];
    expect(isHostAllowed("api.github.com", allowed)).toBe(true);
    expect(isHostAllowed("registry.npmjs.org", allowed)).toBe(true);
    expect(isHostAllowed("evil.com", allowed)).toBe(false);
  });

  it("returns false for empty allowed list", () => {
    expect(isHostAllowed("anything.com", [])).toBe(false);
  });
});
