import { describe, it, expect } from "vitest";
import { generateId, generateApiKey } from "./id.js";

describe("generateId", () => {
  it("returns a valid UUID v4", () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("generateApiKey", () => {
  it("starts with nrn_ prefix", () => {
    const key = generateApiKey();
    expect(key.startsWith("nrn_")).toBe(true);
  });

  it("has correct length (nrn_ + 64 hex chars)", () => {
    const key = generateApiKey();
    expect(key.length).toBe(4 + 64);
  });

  it("contains only hex characters after prefix", () => {
    const key = generateApiKey();
    const hex = key.slice(4);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique keys", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey()));
    expect(keys.size).toBe(50);
  });
});
