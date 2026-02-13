import { describe, it, expect } from "vitest";
import { computeNextRunAtMs } from "./schedule.js";

describe("computeNextRunAtMs", () => {
  describe("at schedule", () => {
    it("returns timestamp if in the future", () => {
      const futureMs = Date.now() + 60_000;
      const at = new Date(futureMs).toISOString();
      const result = computeNextRunAtMs({ kind: "at", at }, Date.now());
      expect(result).toBe(futureMs);
    });

    it("returns undefined if in the past", () => {
      const pastMs = Date.now() - 60_000;
      const at = new Date(pastMs).toISOString();
      const result = computeNextRunAtMs({ kind: "at", at }, Date.now());
      expect(result).toBeUndefined();
    });

    it("returns undefined for invalid date string", () => {
      const result = computeNextRunAtMs({ kind: "at", at: "not-a-date" }, Date.now());
      expect(result).toBeUndefined();
    });
  });

  describe("every schedule", () => {
    it("computes next interval from anchor", () => {
      const anchor = 1000;
      const every = 500;
      const now = 1600;
      const result = computeNextRunAtMs({ kind: "every", everyMs: every, anchorMs: anchor }, now);
      expect(result).toBe(2000);
    });

    it("returns anchor if anchor is in the future", () => {
      const result = computeNextRunAtMs(
        { kind: "every", everyMs: 1000, anchorMs: 5000 },
        1000,
      );
      expect(result).toBe(5000);
    });

    it("uses epoch 0 as default anchor", () => {
      const result = computeNextRunAtMs({ kind: "every", everyMs: 1000 }, 2500);
      expect(result).toBe(3000);
    });

    it("returns undefined for zero interval", () => {
      const result = computeNextRunAtMs({ kind: "every", everyMs: 0 }, 1000);
      expect(result).toBeUndefined();
    });

    it("returns undefined for negative interval", () => {
      const result = computeNextRunAtMs({ kind: "every", everyMs: -100 }, 1000);
      expect(result).toBeUndefined();
    });
  });

  describe("cron schedule", () => {
    it("computes next minute for * * * * *", () => {
      const now = new Date("2025-01-15T10:30:00Z").getTime();
      const result = computeNextRunAtMs({ kind: "cron", expr: "* * * * *" }, now);
      expect(result).toBeDefined();
      expect(result!).toBeGreaterThan(now);
      const diff = result! - now;
      expect(diff).toBeLessThanOrEqual(60_000);
    });

    it("computes specific minute", () => {
      const now = new Date("2025-01-15T10:00:00Z").getTime();
      const result = computeNextRunAtMs({ kind: "cron", expr: "30 * * * *" }, now);
      expect(result).toBeDefined();
      const d = new Date(result!);
      expect(d.getMinutes()).toBe(30);
    });

    it("computes specific hour and minute", () => {
      const now = new Date("2025-01-15T08:00:00Z").getTime();
      const result = computeNextRunAtMs({ kind: "cron", expr: "0 12 * * *" }, now);
      expect(result).toBeDefined();
      const d = new Date(result!);
      expect(d.getHours()).toBe(12);
      expect(d.getMinutes()).toBe(0);
    });

    it("handles ranges", () => {
      const now = new Date("2025-01-15T10:00:00Z").getTime();
      const result = computeNextRunAtMs({ kind: "cron", expr: "0-5 * * * *" }, now);
      expect(result).toBeDefined();
      const d = new Date(result!);
      expect(d.getMinutes()).toBeLessThanOrEqual(5);
    });

    it("handles step values", () => {
      const now = new Date("2025-01-15T10:00:00Z").getTime();
      const result = computeNextRunAtMs({ kind: "cron", expr: "*/15 * * * *" }, now);
      expect(result).toBeDefined();
      const d = new Date(result!);
      expect(d.getMinutes() % 15).toBe(0);
    });

    it("returns undefined for invalid expression", () => {
      const result = computeNextRunAtMs({ kind: "cron", expr: "bad" }, Date.now());
      expect(result).toBeUndefined();
    });

    it("returns undefined for too many fields", () => {
      const result = computeNextRunAtMs({ kind: "cron", expr: "* * * * * *" }, Date.now());
      expect(result).toBeUndefined();
    });
  });
});
