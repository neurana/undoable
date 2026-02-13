export type RunMode = "interactive" | "autonomous" | "supervised";

export type RunModeConfig = {
  mode: RunMode;
  maxIterations: number;
  dangerouslySkipPermissions: boolean;
};

const MODE_DEFAULTS: Record<RunMode, { maxIterations: number }> = {
  interactive: { maxIterations: 10 },
  autonomous: { maxIterations: 200 },
  supervised: { maxIterations: 50 },
};

export function resolveRunMode(params?: {
  mode?: RunMode;
  maxIterations?: number;
  dangerouslySkipPermissions?: boolean;
}): RunModeConfig {
  const skipPerms = params?.dangerouslySkipPermissions === true;
  const mode = skipPerms ? "autonomous" : (params?.mode ?? "interactive");
  const defaults = MODE_DEFAULTS[mode];
  return {
    mode,
    maxIterations: params?.maxIterations ?? defaults.maxIterations,
    dangerouslySkipPermissions: skipPerms,
  };
}

export function shouldAutoApprove(config: RunModeConfig): boolean {
  return config.mode === "autonomous" || config.dangerouslySkipPermissions;
}
