import { describe, it, expect } from "vitest";
import { hashKey, verifyKey, extractBearerToken, extractApiKey } from "./api-key.js";

describe("api-key", () => {
  describe("hashKey + verifyKey", () => {
    it("hashes and verifies correctly", () => {
      const key = "nrn_test123456";
      const hash = hashKey(key);
      expect(verifyKey(key, hash)).toBe(true);
    });

    it("rejects wrong key", () => {
      const hash = hashKey("nrn_correct");
      expect(verifyKey("nrn_wrong", hash)).toBe(false);
    });

    it("produces deterministic hash", () => {
      const key = "nrn_abc";
      expect(hashKey(key)).toBe(hashKey(key));
    });
  });

  describe("extractBearerToken", () => {
    it("extracts token from Bearer header", () => {
      expect(extractBearerToken("Bearer abc123")).toBe("abc123");
    });

    it("returns null for missing header", () => {
      expect(extractBearerToken(undefined)).toBeNull();
    });

    it("returns null for non-Bearer header", () => {
      expect(extractBearerToken("Basic abc123")).toBeNull();
    });

    it("returns null for malformed header", () => {
      expect(extractBearerToken("Bearer")).toBeNull();
    });
  });

  describe("extractApiKey", () => {
    it("extracts raw nrn_ prefixed key", () => {
      expect(extractApiKey("nrn_test123")).toBe("nrn_test123");
    });

    it("extracts key from ApiKey header", () => {
      expect(extractApiKey("ApiKey nrn_test123")).toBe("nrn_test123");
    });

    it("returns null for missing header", () => {
      expect(extractApiKey(undefined)).toBeNull();
    });

    it("returns null for unrecognized format", () => {
      expect(extractApiKey("Basic abc")).toBeNull();
    });
  });
});
