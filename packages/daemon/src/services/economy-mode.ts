import type { ContextWindowConfig } from "./context-window.js";

export type EconomyModeInput = {
  enabled?: boolean;
  maxIterationsCap?: number;
  toolResultMaxChars?: number;
  contextMaxTokens?: number;
  contextThreshold?: number;
};

export type EconomyModeConfig = {
  enabled: boolean;
  maxIterationsCap: number;
  toolResultMaxChars: number;
  compaction: ContextWindowConfig;
};

const DEFAULTS = {
  enabled: false,
  maxIterationsCap: 6,
  toolResultMaxChars: 8_000,
  contextMaxTokens: 64_000,
  contextThreshold: 0.55,
} as const;

function parseIntBounded(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseFloatBounded(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function resolveEconomyMode(input?: EconomyModeInput): EconomyModeConfig {
  const enabled = input?.enabled === true;
  const maxIterationsCap = Number.isFinite(input?.maxIterationsCap)
    ? Math.max(1, Math.floor(input!.maxIterationsCap!))
    : DEFAULTS.maxIterationsCap;
  const toolResultMaxChars = Number.isFinite(input?.toolResultMaxChars)
    ? Math.max(1_000, Math.floor(input!.toolResultMaxChars!))
    : DEFAULTS.toolResultMaxChars;
  const contextMaxTokens = Number.isFinite(input?.contextMaxTokens)
    ? Math.max(8_000, Math.floor(input!.contextMaxTokens!))
    : DEFAULTS.contextMaxTokens;
  const contextThreshold = Number.isFinite(input?.contextThreshold)
    ? Math.min(0.95, Math.max(0.2, Number(input!.contextThreshold!)))
    : DEFAULTS.contextThreshold;

  return {
    enabled,
    maxIterationsCap,
    toolResultMaxChars,
    compaction: {
      maxTokens: contextMaxTokens,
      threshold: contextThreshold,
    },
  };
}

export function resolveEconomyModeFromEnv(): EconomyModeInput {
  const enabledRaw = process.env.UNDOABLE_ECONOMY_MODE?.trim();
  const enabled = enabledRaw === "1" || enabledRaw === "true";

  return {
    enabled,
    maxIterationsCap: parseIntBounded(
      process.env.UNDOABLE_ECONOMY_MAX_ITERATIONS?.trim(),
      DEFAULTS.maxIterationsCap,
      1,
      200,
    ),
    toolResultMaxChars: parseIntBounded(
      process.env.UNDOABLE_ECONOMY_TOOL_RESULT_CHARS?.trim(),
      DEFAULTS.toolResultMaxChars,
      1_000,
      100_000,
    ),
    contextMaxTokens: parseIntBounded(
      process.env.UNDOABLE_ECONOMY_CONTEXT_MAX_TOKENS?.trim(),
      DEFAULTS.contextMaxTokens,
      8_000,
      400_000,
    ),
    contextThreshold: parseFloatBounded(
      process.env.UNDOABLE_ECONOMY_CONTEXT_THRESHOLD?.trim(),
      DEFAULTS.contextThreshold,
      0.2,
      0.95,
    ),
  };
}

export function effectiveMaxIterations(
  configuredMaxIterations: number,
  economy: EconomyModeConfig,
): number {
  return economy.enabled
    ? Math.min(configuredMaxIterations, economy.maxIterationsCap)
    : configuredMaxIterations;
}

export function effectiveToolResultLimit(
  defaultChars: number,
  economy: EconomyModeConfig,
): number {
  return economy.enabled
    ? Math.min(defaultChars, economy.toolResultMaxChars)
    : defaultChars;
}

export function effectiveCanThink(
  modelSupportsThinking: boolean,
  economy: EconomyModeConfig,
): boolean {
  return modelSupportsThinking && !economy.enabled;
}
