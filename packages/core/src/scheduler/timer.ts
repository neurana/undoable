import type { ScheduledJob, JobExecutor, SchedulerEvent } from "./types.js";
import { computeNextRunAtMs } from "./schedule.js";
import { recomputeAllNextRuns } from "./store.js";

const MAX_TIMER_DELAY_MS = 60_000;
const STUCK_RUN_MS = 10 * 60_000;

export type TimerState = {
  jobs: ScheduledJob[];
  timer: NodeJS.Timeout | null;
  running: boolean;
  enabled: boolean;
  nowMs: () => number;
  executor: JobExecutor;
  onEvent?: (evt: SchedulerEvent) => void;
  onPersist: () => Promise<void>;
};

export function armTimer(state: TimerState): void {
  clearTimer(state);
  if (!state.enabled) return;

  const nextAt = nextWakeAtMs(state.jobs);
  if (!nextAt) return;

  const delay = Math.max(nextAt - state.nowMs(), 0);
  const clamped = Math.min(delay, MAX_TIMER_DELAY_MS);

  state.timer = setTimeout(async () => {
    try {
      await onTick(state);
    } catch {
      armTimer(state);
    }
  }, clamped);
}

export function clearTimer(state: TimerState): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

export async function runMissedJobs(state: TimerState): Promise<void> {
  const now = state.nowMs();
  const missed = findDueJobs(state.jobs, now);
  for (const job of missed) {
    await executeJob(state, job, now);
  }
}

export async function runSingleJob(
  state: TimerState,
  job: ScheduledJob,
  force: boolean,
): Promise<boolean> {
  const now = state.nowMs();
  if (!force && !isDue(job, now)) return false;
  await executeJob(state, job, now);
  return true;
}

function nextWakeAtMs(jobs: ScheduledJob[]): number | undefined {
  let min: number | undefined;
  for (const job of jobs) {
    if (!job.enabled) continue;
    const next = job.state.nextRunAtMs;
    if (typeof next === "number" && (min === undefined || next < min)) {
      min = next;
    }
  }
  return min;
}

function findDueJobs(jobs: ScheduledJob[], nowMs: number): ScheduledJob[] {
  return jobs.filter((j) => isDue(j, nowMs));
}

function isDue(job: ScheduledJob, nowMs: number): boolean {
  if (!job.enabled) return false;
  if (typeof job.state.runningAtMs === "number") return false;
  const next = job.state.nextRunAtMs;
  return typeof next === "number" && nowMs >= next;
}

async function onTick(state: TimerState): Promise<void> {
  if (state.running) return;
  state.running = true;

  try {
    clearStuckJobs(state);
    const now = state.nowMs();
    const due = findDueJobs(state.jobs, now);

    for (const job of due) {
      await executeJob(state, job, now);
    }

    if (recomputeAllNextRuns(state.jobs, state.nowMs())) {
      await state.onPersist();
    }
  } finally {
    state.running = false;
    armTimer(state);
  }
}

async function executeJob(state: TimerState, job: ScheduledJob, nowMs: number): Promise<void> {
  job.state.runningAtMs = nowMs;
  job.state.lastError = undefined;
  state.onEvent?.({ jobId: job.id, action: "started", runAtMs: nowMs });

  const startMs = state.nowMs();
  let result: { status: "ok" | "error" | "skipped"; error?: string };

  try {
    result = await state.executor(job);
  } catch (err) {
    result = { status: "error", error: String(err) };
  }

  const endMs = state.nowMs();
  job.state.runningAtMs = undefined;
  job.state.lastRunAtMs = nowMs;
  job.state.lastStatus = result.status;
  job.state.lastDurationMs = endMs - startMs;

  if (result.status === "error") {
    job.state.lastError = result.error;
    job.state.consecutiveErrors = (job.state.consecutiveErrors ?? 0) + 1;
  } else {
    job.state.consecutiveErrors = 0;
  }

  const shouldDelete =
    job.deleteAfterRun === true &&
    (result.status === "ok" || job.schedule.kind === "at");

  if (job.schedule.kind === "at" && job.state.lastStatus === "ok") {
    job.state.nextRunAtMs = undefined;
  } else {
    job.state.nextRunAtMs = job.enabled
      ? computeNextRunAtMs(job.schedule, state.nowMs())
      : undefined;
  }

  state.onEvent?.({
    jobId: job.id,
    action: "finished",
    status: result.status,
    error: result.error,
    durationMs: job.state.lastDurationMs,
    nextRunAtMs: job.state.nextRunAtMs,
  });

  if (shouldDelete) {
    const idx = state.jobs.indexOf(job);
    if (idx >= 0) state.jobs.splice(idx, 1);
    state.onEvent?.({ jobId: job.id, action: "removed" });
  }

  await state.onPersist();
}

function clearStuckJobs(state: TimerState): void {
  const now = state.nowMs();
  for (const job of state.jobs) {
    if (typeof job.state.runningAtMs === "number" && now - job.state.runningAtMs > STUCK_RUN_MS) {
      job.state.runningAtMs = undefined;
    }
  }
}
