import type { CronSchedule } from "./types.js";

const CRON_FIELD_COUNT = 5;

export function computeNextRunAtMs(schedule: CronSchedule, nowMs: number): number | undefined {
  switch (schedule.kind) {
    case "at":
      return computeAtNext(schedule.at, nowMs);
    case "every":
      return computeEveryNext(schedule.everyMs, nowMs, schedule.anchorMs);
    case "cron":
      return computeCronNext(schedule.expr, nowMs, schedule.tz);
  }
}

function computeAtNext(at: string, nowMs: number): number | undefined {
  const ms = parseTimeMs(at);
  if (ms === undefined) return undefined;
  return ms >= nowMs ? ms : undefined;
}

function computeEveryNext(everyMs: number, nowMs: number, anchorMs?: number): number | undefined {
  if (everyMs <= 0) return undefined;
  const anchor = anchorMs ?? 0;
  if (anchor > nowMs) return anchor;
  const elapsed = nowMs - anchor;
  const periods = Math.floor(elapsed / everyMs);
  const next = anchor + (periods + 1) * everyMs;
  return next;
}

function computeCronNext(expr: string, nowMs: number, tz?: string): number | undefined {
  const fields = parseCronExpr(expr);
  if (!fields) return undefined;

  const start = tz ? dateInTz(nowMs + 60_000, tz) : new Date(nowMs + 60_000);
  start.setSeconds(0, 0);

  for (let i = 0; i < 366 * 24 * 60; i++) {
    const candidate = new Date(start.getTime() + i * 60_000);
    const month = candidate.getMonth() + 1;
    const day = candidate.getDate();
    const dow = candidate.getDay();
    const hour = candidate.getHours();
    const minute = candidate.getMinutes();

    if (
      fields.months.has(month) &&
      fields.days.has(day) &&
      fields.dows.has(dow) &&
      fields.hours.has(hour) &&
      fields.minutes.has(minute)
    ) {
      return candidate.getTime();
    }
  }
  return undefined;
}

type CronFields = {
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  dows: Set<number>;
};

function parseCronExpr(expr: string): CronFields | undefined {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== CRON_FIELD_COUNT) return undefined;

  const [minF, hourF, dayF, monthF, dowF] = parts as [string, string, string, string, string];
  const minutes = expandField(minF, 0, 59);
  const hours = expandField(hourF, 0, 23);
  const days = expandField(dayF, 1, 31);
  const months = expandField(monthF, 1, 12);
  const dows = expandField(dowF, 0, 6);

  if (!minutes || !hours || !days || !months || !dows) return undefined;
  return { minutes, hours, days, months, dows };
}

function expandField(field: string, min: number, max: number): Set<number> | undefined {
  const result = new Set<number>();

  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const step = stepMatch ? Number(stepMatch[2]) : 1;
    const range = stepMatch ? stepMatch[1]! : part;

    if (step <= 0) return undefined;

    if (range === "*") {
      for (let i = min; i <= max; i += step) result.add(i);
      continue;
    }

    const rangeMatch = range.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const lo = Number(rangeMatch[1]);
      const hi = Number(rangeMatch[2]);
      if (lo < min || hi > max || lo > hi) return undefined;
      for (let i = lo; i <= hi; i += step) result.add(i);
      continue;
    }

    const num = Number(range);
    if (!Number.isInteger(num) || num < min || num > max) return undefined;
    result.add(num);
  }

  return result.size > 0 ? result : undefined;
}

function parseTimeMs(value: string): number | undefined {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function dateInTz(ms: number, tz: string): Date {
  try {
    const str = new Date(ms).toLocaleString("en-US", { timeZone: tz });
    return new Date(str);
  } catch {
    return new Date(ms);
  }
}
