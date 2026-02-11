import { describe, it, expect } from "vitest";
import { sha256, hashApiKey, timingSafeCompare } from "./hash.js";

describe("sha256", () => {
  it("produces a 64-char hex string", () => {
    const hash = sha256("hello");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(sha256("test")).toBe(sha256("test"));
  });

  it("produces different hashes for different inputs", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });

  it("matches known SHA-256 for empty string", () => {
    expect(sha256("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("accepts Buffer input", () => {
    const hash = sha256(Buffer.from("hello"));
    expect(hash).toBe(sha256("hello"));
  });
});

describe("hashApiKey", () => {
  it("returns sha256 of the key", () => {
    const key = "nrn_abc123";
    expect(hashApiKey(key)).toBe(sha256(key));
  });
});

describe("timingSafeCompare", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeCompare("abc", "abc")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(timingSafeCompare("abc", "abd")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(timingSafeCompare("abc", "abcd")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(timingSafeCompare("", "")).toBe(true);
  });
});
