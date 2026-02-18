import { afterEach, describe, expect, it } from "vitest";
import {
  effectiveCanThink,
  effectiveMaxIterations,
  effectiveToolResultLimit,
  resolveEconomyMode,
  resolveEconomyModeFromEnv,
} from "./economy-mode.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("economy-mode", () => {
  it("resolves sane defaults", () => {
    const cfg = resolveEconomyMode();
    expect(cfg.enabled).toBe(false);
    expect(cfg.maxIterationsCap).toBeGreaterThan(0);
    expect(cfg.toolResultMaxChars).toBeGreaterThan(1000);
    expect(cfg.compaction.maxTokens).toBeGreaterThan(10000);
    expect(cfg.compaction.threshold).toBeGreaterThan(0.2);
  });

  it("derives effective limits only when enabled", () => {
    const off = resolveEconomyMode({ enabled: false, maxIterationsCap: 4, toolResultMaxChars: 4000 });
    expect(effectiveMaxIterations(20, off)).toBe(20);
    expect(effectiveToolResultLimit(30000, off)).toBe(30000);
    expect(effectiveCanThink(true, off)).toBe(true);

    const on = resolveEconomyMode({ enabled: true, maxIterationsCap: 4, toolResultMaxChars: 4000 });
    expect(effectiveMaxIterations(20, on)).toBe(4);
    expect(effectiveToolResultLimit(30000, on)).toBe(4000);
    expect(effectiveCanThink(true, on)).toBe(false);
  });

  it("reads environment overrides", () => {
    process.env.UNDOABLE_ECONOMY_MODE = "1";
    process.env.UNDOABLE_ECONOMY_MAX_ITERATIONS = "3";
    process.env.UNDOABLE_ECONOMY_TOOL_RESULT_CHARS = "2500";
    process.env.UNDOABLE_ECONOMY_CONTEXT_MAX_TOKENS = "50000";
    process.env.UNDOABLE_ECONOMY_CONTEXT_THRESHOLD = "0.6";

    const env = resolveEconomyModeFromEnv();
    expect(env.enabled).toBe(true);
    expect(env.maxIterationsCap).toBe(3);
    expect(env.toolResultMaxChars).toBe(2500);
    expect(env.contextMaxTokens).toBe(50000);
    expect(env.contextThreshold).toBeCloseTo(0.6);
  });
});
