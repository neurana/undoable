import { describe, expect, it } from "vitest";
import type { JobCreate, JobPatch, ScheduledJob } from "@undoable/core";
import { JobsUndoRedoService } from "./jobs-undo-redo-service.js";

function makeJob(id: string, name: string): ScheduledJob {
  return {
    id,
    name,
    description: "",
    enabled: true,
    createdAtMs: 1,
    updatedAtMs: 1,
    schedule: { kind: "every", everyMs: 60_000 },
    payload: { kind: "event", text: `event-${id}` },
    state: {},
  };
}

function createSchedulerHarness(seed: ScheduledJob[]) {
  const jobs = [...seed];
  let nextId = 100;

  return {
    get jobs() {
      return jobs;
    },
    scheduler: {
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
        if (idx < 0) throw new Error("missing job");
        const next: ScheduledJob = {
          ...jobs[idx]!,
          ...patch,
          state: { ...jobs[idx]!.state, ...patch.state },
          updatedAtMs: Date.now(),
        };
        jobs[idx] = next;
        return next;
      },
      remove: async (id: string) => {
        const idx = jobs.findIndex((job) => job.id === id);
        if (idx < 0) return false;
        jobs.splice(idx, 1);
        return true;
      },
    },
  };
}

describe("JobsUndoRedoService", () => {
  it("undoes and redoes create operations", async () => {
    const svc = new JobsUndoRedoService();
    const harness = createSchedulerHarness([]);

    const created = await harness.scheduler.add({
      name: "Daily backup",
      enabled: true,
      schedule: { kind: "every", everyMs: 60_000 },
      payload: { kind: "event", text: "backup" },
    });
    svc.recordCreate(created);

    expect(svc.status().undoCount).toBe(1);

    const undo = await svc.undoLast(harness.scheduler);
    expect(undo.ok).toBe(true);
    expect(harness.jobs).toHaveLength(0);
    expect(svc.status().redoCount).toBe(1);

    const redo = await svc.redoLast(harness.scheduler);
    expect(redo.ok).toBe(true);
    expect(harness.jobs).toHaveLength(1);
    expect(harness.jobs[0]?.name).toBe("Daily backup");
  });

  it("undoes and redoes update operations", async () => {
    const svc = new JobsUndoRedoService();
    const harness = createSchedulerHarness([makeJob("job-1", "Original")]);

    const before = structuredClone(harness.jobs[0]!);
    const after = await harness.scheduler.update("job-1", {
      name: "Changed",
      schedule: { kind: "cron", expr: "*/5 * * * *" },
      payload: { kind: "event", text: "changed" },
    });
    svc.recordUpdate(before, after);

    const undo = await svc.undoLast(harness.scheduler);
    expect(undo.ok).toBe(true);
    expect(harness.jobs[0]?.name).toBe("Original");
    expect(harness.jobs[0]?.schedule.kind).toBe("every");

    const redo = await svc.redoLast(harness.scheduler);
    expect(redo.ok).toBe(true);
    expect(harness.jobs[0]?.name).toBe("Changed");
    expect(harness.jobs[0]?.schedule.kind).toBe("cron");
  });

  it("undoes and redoes delete operations", async () => {
    const svc = new JobsUndoRedoService();
    const harness = createSchedulerHarness([makeJob("job-9", "To delete")]);

    const snapshot = structuredClone(harness.jobs[0]!);
    await harness.scheduler.remove("job-9");
    svc.recordDelete(snapshot);

    const undo = await svc.undoLast(harness.scheduler);
    expect(undo.ok).toBe(true);
    expect(harness.jobs).toHaveLength(1);
    expect(harness.jobs[0]?.name).toBe("To delete");

    const redo = await svc.redoLast(harness.scheduler);
    expect(redo.ok).toBe(true);
    expect(harness.jobs).toHaveLength(0);
  });
});
