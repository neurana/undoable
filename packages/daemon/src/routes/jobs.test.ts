import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { JobCreate, JobPatch, ScheduledJob } from "@undoable/core";
import { jobRoutes } from "./jobs.js";
import { JobsUndoRedoService } from "../services/jobs-undo-redo-service.js";

function createScheduler() {
  const jobs: ScheduledJob[] = [];
  let nextId = 1;

  return {
    jobs,
    service: {
      status: async () => ({ enabled: true, storePath: "/tmp/jobs.json", jobCount: jobs.length, nextWakeAtMs: null }),
      list: async ({ includeDisabled }: { includeDisabled?: boolean } = {}) =>
        includeDisabled ? [...jobs] : jobs.filter((job) => job.enabled),
      add: async (input: JobCreate) => {
        const created: ScheduledJob = {
          ...input,
          id: `job-${nextId++}`,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          state: input.state ? { ...input.state } : {},
        };
        jobs.push(created);
        return created;
      },
      update: async (id: string, patch: JobPatch) => {
        const idx = jobs.findIndex((job) => job.id === id);
        if (idx < 0) throw new Error("Job not found");
        const updated: ScheduledJob = {
          ...jobs[idx]!,
          ...patch,
          state: { ...jobs[idx]!.state, ...patch.state },
          updatedAtMs: Date.now(),
        };
        jobs[idx] = updated;
        return updated;
      },
      remove: async (id: string) => {
        const idx = jobs.findIndex((job) => job.id === id);
        if (idx < 0) return false;
        jobs.splice(idx, 1);
        return true;
      },
      run: async (id: string) => jobs.some((job) => job.id === id),
    },
  };
}

describe("job routes undo/redo", () => {
  const app = Fastify();
  const scheduler = createScheduler();
  const history = new JobsUndoRedoService();

  beforeAll(async () => {
    jobRoutes(app, scheduler.service as never, history);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("tracks create -> undo -> redo for scheduled jobs", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/jobs",
      payload: {
        name: "Nightly sync",
        enabled: true,
        schedule: { kind: "every", everyMs: 60000 },
        payload: { kind: "event", text: "sync" },
      },
    });
    expect(createRes.statusCode).toBe(201);

    const statusAfterCreate = await app.inject({ method: "GET", url: "/jobs/history/status" });
    expect(statusAfterCreate.statusCode).toBe(200);
    expect(statusAfterCreate.json().undoCount).toBe(1);

    const undoRes = await app.inject({ method: "POST", url: "/jobs/history/undo" });
    expect(undoRes.statusCode).toBe(200);
    expect(undoRes.json().ok).toBe(true);

    const listAfterUndo = await app.inject({ method: "GET", url: "/jobs" });
    expect(listAfterUndo.json()).toHaveLength(0);

    const redoRes = await app.inject({ method: "POST", url: "/jobs/history/redo" });
    expect(redoRes.statusCode).toBe(200);
    expect(redoRes.json().ok).toBe(true);

    const listAfterRedo = await app.inject({ method: "GET", url: "/jobs" });
    expect(listAfterRedo.json()).toHaveLength(1);
  });

  it("records updates so schedule changes are undoable", async () => {
    const current = scheduler.jobs[0];
    expect(current).toBeTruthy();

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/jobs/${current!.id}`,
      payload: {
        schedule: { kind: "cron", expr: "*/5 * * * *" },
        payload: { kind: "event", text: "sync-updated" },
      },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().schedule.kind).toBe("cron");

    const undoRes = await app.inject({ method: "POST", url: "/jobs/history/undo" });
    expect(undoRes.statusCode).toBe(200);

    const listRes = await app.inject({ method: "GET", url: "/jobs" });
    expect(listRes.statusCode).toBe(200);
    const [job] = listRes.json() as ScheduledJob[];
    expect(job?.schedule.kind).toBe("every");
  });
});
