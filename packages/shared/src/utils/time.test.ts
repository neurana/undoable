import { describe, it, expect } from "vitest";
import { nowISO, elapsedMs } from "./time.js";

describe("nowISO", () => {
  it("returns a valid ISO 8601 string", () => {
    const ts = nowISO();
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it("returns current time within 1 second", () => {
    const before = Date.now();
    const ts = nowISO();
    const after = Date.now();
    const parsed = new Date(ts).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});

describe("elapsedMs", () => {
  it("returns positive elapsed time", () => {
    const start = Date.now() - 100;
    const elapsed = elapsedMs(start);
    expect(elapsed).toBeGreaterThanOrEqual(100);
    expect(elapsed).toBeLessThan(200);
  });

  it("returns 0 or near-zero for current time", () => {
    const elapsed = elapsedMs(Date.now());
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(10);
  });
});
