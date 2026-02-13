import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadStore, saveStore, createJob, applyPatch, recomputeAllNextRuns } from "./store.js";
import type { JobCreate, ScheduledJob } from "./types.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scheduler-store-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("loadStore / saveStore", () => {
  it("returns empty store for missing file", async () => {
    const store = await loadStore(path.join(tmpDir, "missing.json"));
    expect(store.version).toBe(1);
    expect(store.jobs).toEqual([]);
  });

  it("round-trips store to disk", async () => {
    const storePath = path.join(tmpDir, "store.json");
    const store = { version: 1 as const, jobs: [makeJob("test-1")] };
    await saveStore(storePath, store);
    const loaded = await loadStore(storePath);
    expect(loaded.jobs).toHaveLength(1);
    expect(loaded.jobs[0]!.id).toBe("test-1");
  });

  it("handles corrupt JSON gracefully", async () => {
    const storePath = path.join(tmpDir, "bad.json");
    await fs.writeFile(storePath, "not json", "utf-8");
    const store = await loadStore(storePath);
    expect(store.jobs).toEqual([]);
  });
});

describe("createJob", () => {
  it("creates a job with generated id and timestamps", () => {
    const input: JobCreate = {
      name: "daily backup",
      enabled: true,
      schedule: { kind: "every", everyMs: 86400_000 },
      payload: { kind: "run", instruction: "backup" },
    };
    const now = 1000000;
    const job = createJob(input, now);
    expect(job.id).toBeTruthy();
    expect(job.createdAtMs).toBe(now);
    expect(job.updatedAtMs).toBe(now);
    expect(job.name).toBe("daily backup");
    expect(job.enabled).toBe(true);
  });

  it("sets anchorMs for every schedule if missing", () => {
    const input: JobCreate = {
      name: "test",
      enabled: true,
      schedule: { kind: "every", everyMs: 5000 },
      payload: { kind: "event", text: "ping" },
    };
    const job = createJob(input, 42000);
    expect(job.schedule.kind).toBe("every");
    if (job.schedule.kind === "every") {
      expect(job.schedule.anchorMs).toBe(42000);
    }
  });

  it("defaults deleteAfterRun to true for at schedules", () => {
    const input: JobCreate = {
      name: "once",
      enabled: true,
      schedule: { kind: "at", at: new Date(Date.now() + 60000).toISOString() },
      payload: { kind: "event", text: "fire" },
    };
    const job = createJob(input, Date.now());
    expect(job.deleteAfterRun).toBe(true);
  });

  it("defaults deleteAfterRun to false for every schedules", () => {
    const input: JobCreate = {
      name: "recurring",
      enabled: true,
      schedule: { kind: "every", everyMs: 1000 },
      payload: { kind: "event", text: "tick" },
    };
    const job = createJob(input, Date.now());
    expect(job.deleteAfterRun).toBe(false);
  });

  it("computes nextRunAtMs on creation", () => {
    const input: JobCreate = {
      name: "soon",
      enabled: true,
      schedule: { kind: "every", everyMs: 1000 },
      payload: { kind: "event", text: "tick" },
    };
    const job = createJob(input, 5000);
    expect(job.state.nextRunAtMs).toBeDefined();
    expect(job.state.nextRunAtMs).toBeGreaterThan(5000);
  });
});

describe("applyPatch", () => {
  it("updates name and recalculates nextRunAtMs", () => {
    const job = makeJob("p1");
    const patched = applyPatch(job, { name: "new name" }, 2000);
    expect(patched.name).toBe("new name");
    expect(patched.updatedAtMs).toBe(2000);
  });

  it("disabling clears nextRunAtMs", () => {
    const job = makeJob("p2");
    job.state.nextRunAtMs = 5000;
    const patched = applyPatch(job, { enabled: false }, 2000);
    expect(patched.enabled).toBe(false);
    expect(patched.state.nextRunAtMs).toBeUndefined();
  });

  it("merges partial state", () => {
    const job = makeJob("p3");
    job.state.consecutiveErrors = 3;
    const patched = applyPatch(job, { state: { consecutiveErrors: 0 } }, 2000);
    expect(patched.state.consecutiveErrors).toBe(0);
  });
});

describe("recomputeAllNextRuns", () => {
  it("clears nextRunAtMs for disabled jobs", () => {
    const job = makeJob("r1");
    job.enabled = false;
    job.state.nextRunAtMs = 9999;
    const changed = recomputeAllNextRuns([job], 1000);
    expect(changed).toBe(true);
    expect(job.state.nextRunAtMs).toBeUndefined();
  });

  it("recomputes due jobs", () => {
    const job = makeJob("r2");
    job.state.nextRunAtMs = 500;
    const changed = recomputeAllNextRuns([job], 1000);
    expect(changed).toBe(true);
    expect(job.state.nextRunAtMs).toBeGreaterThan(1000);
  });

  it("preserves future nextRunAtMs", () => {
    const job = makeJob("r3");
    job.state.nextRunAtMs = 99999;
    const changed = recomputeAllNextRuns([job], 1000);
    expect(changed).toBe(false);
    expect(job.state.nextRunAtMs).toBe(99999);
  });
});

function makeJob(id: string): ScheduledJob {
  return {
    id,
    name: `job-${id}`,
    enabled: true,
    createdAtMs: 0,
    updatedAtMs: 0,
    schedule: { kind: "every", everyMs: 5000, anchorMs: 0 },
    payload: { kind: "event", text: "test" },
    state: {},
  };
}
