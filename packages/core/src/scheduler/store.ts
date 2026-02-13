import fs from "node:fs/promises";
import path from "node:path";
import type { JobStoreFile, ScheduledJob, JobCreate, JobPatch } from "./types.js";
import { computeNextRunAtMs } from "./schedule.js";

function emptyStore(): JobStoreFile {
  return { version: 1, jobs: [] };
}

export async function loadStore(storePath: string): Promise<JobStoreFile> {
  try {
    const raw = await fs.readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw) as JobStoreFile;
    if (!Array.isArray(parsed.jobs)) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

export async function saveStore(storePath: string, store: JobStoreFile): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf-8");
}

export function createJob(input: JobCreate, nowMs: number): ScheduledJob {
  const id = crypto.randomUUID();
  const schedule =
    input.schedule.kind === "every" && !input.schedule.anchorMs
      ? { ...input.schedule, anchorMs: nowMs }
      : input.schedule;

  const deleteAfterRun =
    typeof input.deleteAfterRun === "boolean"
      ? input.deleteAfterRun
      : schedule.kind === "at";

  const job: ScheduledJob = {
    id,
    name: input.name,
    description: input.description,
    enabled: input.enabled,
    deleteAfterRun,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    schedule,
    payload: input.payload,
    state: {
      ...input.state,
      nextRunAtMs: undefined,
    },
  };

  job.state.nextRunAtMs = computeNextRunAtMs(schedule, nowMs);
  return job;
}

export function applyPatch(job: ScheduledJob, patch: JobPatch, nowMs: number): ScheduledJob {
  const updated = { ...job, updatedAtMs: nowMs };

  if (patch.name !== undefined) updated.name = patch.name;
  if (patch.description !== undefined) updated.description = patch.description;
  if (patch.enabled !== undefined) updated.enabled = patch.enabled;
  if (patch.deleteAfterRun !== undefined) updated.deleteAfterRun = patch.deleteAfterRun;
  if (patch.schedule !== undefined) updated.schedule = patch.schedule;
  if (patch.payload !== undefined) updated.payload = patch.payload;
  if (patch.state) updated.state = { ...updated.state, ...patch.state };

  updated.state.nextRunAtMs = updated.enabled
    ? computeNextRunAtMs(updated.schedule, nowMs)
    : undefined;

  return updated;
}

export function recomputeAllNextRuns(jobs: ScheduledJob[], nowMs: number): boolean {
  let changed = false;
  for (const job of jobs) {
    if (!job.enabled) {
      if (job.state.nextRunAtMs !== undefined) {
        job.state.nextRunAtMs = undefined;
        changed = true;
      }
      continue;
    }
    const next = job.state.nextRunAtMs;
    const isDueOrMissing = next === undefined || nowMs >= next;
    if (isDueOrMissing) {
      const newNext = computeNextRunAtMs(job.schedule, nowMs);
      if (job.state.nextRunAtMs !== newNext) {
        job.state.nextRunAtMs = newNext;
        changed = true;
      }
    }
  }
  return changed;
}
