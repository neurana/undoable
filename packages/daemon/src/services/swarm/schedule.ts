import type { CronSchedule } from "@undoable/core";
import type { SwarmNodeSchedule, SwarmNodeScheduleInput } from "./types.js";
import { cleanOptionalString } from "./utils.js";

export function normalizeSchedule(input?: SwarmNodeScheduleInput): SwarmNodeSchedule {
  if (!input || input.mode === undefined || input.mode === "manual") {
    return { mode: "manual" };
  }

  if (input.mode === "dependency") {
    return { mode: "dependency" };
  }

  if (input.mode === "every") {
    const rawEveryMs = typeof input.everyMs === "number"
      ? input.everyMs
      : typeof input.everySeconds === "number"
        ? input.everySeconds * 1000
        : 60_000;

    if (!Number.isFinite(rawEveryMs) || rawEveryMs <= 0) {
      throw new Error("everyMs/everySeconds must be a positive number");
    }

    return {
      mode: "every",
      everyMs: Math.floor(rawEveryMs),
      anchorMs: typeof input.anchorMs === "number" ? input.anchorMs : undefined,
    };
  }

  if (input.mode === "at") {
    const at = cleanOptionalString(input.at);
    if (!at) throw new Error("schedule.at is required for mode=at");
    return { mode: "at", at };
  }

  const cronInput = input as Extract<SwarmNodeScheduleInput, { mode: "cron" }>;
  const expr = cleanOptionalString(cronInput.expr);
  if (!expr) throw new Error("schedule.expr is required for mode=cron");
  return {
    mode: "cron",
    expr,
    tz: cleanOptionalString(cronInput.tz),
  };
}

export function toCronSchedule(schedule: SwarmNodeSchedule): CronSchedule | null {
  switch (schedule.mode) {
    case "every":
      return { kind: "every", everyMs: schedule.everyMs, anchorMs: schedule.anchorMs };
    case "at":
      return { kind: "at", at: schedule.at };
    case "cron":
      return { kind: "cron", expr: schedule.expr, tz: schedule.tz };
    default:
      return null;
  }
}
