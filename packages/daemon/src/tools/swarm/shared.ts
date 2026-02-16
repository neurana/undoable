import type { SwarmNodeScheduleInput, SwarmNodeType } from "../../services/swarm-service.js";

export const SWARM_NODE_TYPES: SwarmNodeType[] = [
  "trigger",
  "agent_task",
  "skill_builder",
  "integration_task",
  "router",
  "approval_gate",
];

export const SWARM_SCHEDULE_MODES = ["manual", "dependency", "every", "at", "cron"] as const;

type SwarmScheduleMode = (typeof SWARM_SCHEDULE_MODES)[number];

export function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function asOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return out;
}

export function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function parseScheduleFromArgs(
  args: Record<string, unknown>,
  opts?: { strict?: boolean },
): SwarmNodeScheduleInput | undefined {
  const strict = opts?.strict === true;
  const modeRaw = asOptionalString(args.scheduleMode);

  if (!modeRaw) {
    return strict ? { mode: "manual" } : undefined;
  }

  const mode = modeRaw as SwarmScheduleMode;
  if (!SWARM_SCHEDULE_MODES.includes(mode)) {
    throw new Error(`unsupported scheduleMode: ${modeRaw}`);
  }

  if (mode === "manual" || mode === "dependency") {
    return { mode };
  }

  if (mode === "every") {
    const everySeconds = typeof args.everySeconds === "number"
      ? args.everySeconds
      : Number(args.everySeconds ?? 60);
    if (!Number.isFinite(everySeconds) || everySeconds <= 0) {
      throw new Error("everySeconds must be positive");
    }
    return { mode: "every", everySeconds };
  }

  if (mode === "at") {
    const at = asOptionalString(args.atISO);
    if (!at) throw new Error("atISO is required when scheduleMode=at");
    return { mode: "at", at };
  }

  const expr = asOptionalString(args.cronExpr);
  if (!expr) throw new Error("cronExpr is required when scheduleMode=cron");
  return { mode: "cron", expr, tz: asOptionalString(args.timezone) };
}

export function asError(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : String(error) };
}
