import { randomUUID } from "node:crypto";
import type { JobCreate, JobPatch, ScheduledJob, SchedulerService } from "@undoable/core";

type SchedulerLike = Pick<SchedulerService, "add" | "update" | "remove">;

type JobSnapshot = {
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  schedule: ScheduledJob["schedule"];
  payload: ScheduledJob["payload"];
};

type JobMutationEntry = {
  id: string;
  kind: "create" | "update" | "delete";
  label: string;
  createdAtMs: number;
  currentJobId: string | null;
  before?: JobSnapshot;
  after?: JobSnapshot;
};

export type JobMutationResult = {
  ok: boolean;
  kind: JobMutationEntry["kind"] | "none";
  label: string;
  jobId?: string;
  error?: string;
};

export type JobsUndoRedoStatus = {
  undoCount: number;
  redoCount: number;
  nextUndo?: { id: string; kind: JobMutationEntry["kind"]; label: string; createdAtMs: number };
  nextRedo?: { id: string; kind: JobMutationEntry["kind"]; label: string; createdAtMs: number };
};

function cloneSnapshot(job: ScheduledJob): JobSnapshot {
  return {
    name: job.name,
    description: job.description,
    enabled: job.enabled,
    deleteAfterRun: job.deleteAfterRun,
    schedule: structuredClone(job.schedule),
    payload: structuredClone(job.payload),
  };
}

function toCreateInput(snapshot: JobSnapshot): JobCreate {
  return {
    name: snapshot.name,
    description: snapshot.description,
    enabled: snapshot.enabled,
    deleteAfterRun: snapshot.deleteAfterRun,
    schedule: structuredClone(snapshot.schedule),
    payload: structuredClone(snapshot.payload),
  };
}

function toPatchInput(snapshot: JobSnapshot): JobPatch {
  return {
    name: snapshot.name,
    description: snapshot.description,
    enabled: snapshot.enabled,
    deleteAfterRun: snapshot.deleteAfterRun,
    schedule: structuredClone(snapshot.schedule),
    payload: structuredClone(snapshot.payload),
  };
}

export class JobsUndoRedoService {
  private undoStack: JobMutationEntry[] = [];
  private redoStack: JobMutationEntry[] = [];

  recordCreate(job: ScheduledJob): void {
    this.pushUndo({
      id: randomUUID(),
      kind: "create",
      label: `Created job "${job.name}"`,
      createdAtMs: Date.now(),
      currentJobId: job.id,
      after: cloneSnapshot(job),
    });
  }

  recordUpdate(before: ScheduledJob, after: ScheduledJob): void {
    this.pushUndo({
      id: randomUUID(),
      kind: "update",
      label: `Updated job "${after.name}"`,
      createdAtMs: Date.now(),
      currentJobId: after.id,
      before: cloneSnapshot(before),
      after: cloneSnapshot(after),
    });
  }

  recordDelete(job: ScheduledJob): void {
    this.pushUndo({
      id: randomUUID(),
      kind: "delete",
      label: `Deleted job "${job.name}"`,
      createdAtMs: Date.now(),
      currentJobId: null,
      before: cloneSnapshot(job),
    });
  }

  status(): JobsUndoRedoStatus {
    const nextUndo = this.undoStack[this.undoStack.length - 1];
    const nextRedo = this.redoStack[this.redoStack.length - 1];
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      nextUndo: nextUndo
        ? { id: nextUndo.id, kind: nextUndo.kind, label: nextUndo.label, createdAtMs: nextUndo.createdAtMs }
        : undefined,
      nextRedo: nextRedo
        ? { id: nextRedo.id, kind: nextRedo.kind, label: nextRedo.label, createdAtMs: nextRedo.createdAtMs }
        : undefined,
    };
  }

  async undoLast(scheduler: SchedulerLike): Promise<JobMutationResult> {
    const entry = this.undoStack.pop();
    if (!entry) {
      return { ok: false, kind: "none", label: "No job changes to undo", error: "No job changes to undo" };
    }

    const result = await this.applyUndo(entry, scheduler);
    if (result.ok) {
      this.redoStack.push(entry);
      return result;
    }

    this.undoStack.push(entry);
    return result;
  }

  async redoLast(scheduler: SchedulerLike): Promise<JobMutationResult> {
    const entry = this.redoStack.pop();
    if (!entry) {
      return { ok: false, kind: "none", label: "No job changes to redo", error: "No job changes to redo" };
    }

    const result = await this.applyRedo(entry, scheduler);
    if (result.ok) {
      this.undoStack.push(entry);
      return result;
    }

    this.redoStack.push(entry);
    return result;
  }

  private pushUndo(entry: JobMutationEntry): void {
    this.undoStack.push(entry);
    this.redoStack = [];
  }

  private async applyUndo(entry: JobMutationEntry, scheduler: SchedulerLike): Promise<JobMutationResult> {
    try {
      if (entry.kind === "create") {
        if (!entry.currentJobId) {
          return { ok: false, kind: entry.kind, label: entry.label, error: "Job was already removed" };
        }
        const removed = await scheduler.remove(entry.currentJobId);
        if (!removed) {
          return { ok: false, kind: entry.kind, label: entry.label, error: "Job no longer exists" };
        }
        entry.currentJobId = null;
        return { ok: true, kind: entry.kind, label: entry.label };
      }

      if (entry.kind === "delete") {
        if (!entry.before) {
          return { ok: false, kind: entry.kind, label: entry.label, error: "Missing job snapshot" };
        }
        const recreated = await scheduler.add(toCreateInput(entry.before));
        entry.currentJobId = recreated.id;
        return { ok: true, kind: entry.kind, label: entry.label, jobId: recreated.id };
      }

      if (!entry.before || !entry.currentJobId) {
        return { ok: false, kind: entry.kind, label: entry.label, error: "Missing update snapshot" };
      }
      const updated = await scheduler.update(entry.currentJobId, toPatchInput(entry.before));
      entry.currentJobId = updated.id;
      return { ok: true, kind: entry.kind, label: entry.label, jobId: updated.id };
    } catch (err) {
      return { ok: false, kind: entry.kind, label: entry.label, error: String(err) };
    }
  }

  private async applyRedo(entry: JobMutationEntry, scheduler: SchedulerLike): Promise<JobMutationResult> {
    try {
      if (entry.kind === "create") {
        if (!entry.after) {
          return { ok: false, kind: entry.kind, label: entry.label, error: "Missing job snapshot" };
        }
        const recreated = await scheduler.add(toCreateInput(entry.after));
        entry.currentJobId = recreated.id;
        return { ok: true, kind: entry.kind, label: entry.label, jobId: recreated.id };
      }

      if (entry.kind === "delete") {
        if (!entry.currentJobId) {
          return { ok: false, kind: entry.kind, label: entry.label, error: "Job is not currently present" };
        }
        const removed = await scheduler.remove(entry.currentJobId);
        if (!removed) {
          return { ok: false, kind: entry.kind, label: entry.label, error: "Job no longer exists" };
        }
        entry.currentJobId = null;
        return { ok: true, kind: entry.kind, label: entry.label };
      }

      if (!entry.after || !entry.currentJobId) {
        return { ok: false, kind: entry.kind, label: entry.label, error: "Missing update snapshot" };
      }
      const updated = await scheduler.update(entry.currentJobId, toPatchInput(entry.after));
      entry.currentJobId = updated.id;
      return { ok: true, kind: entry.kind, label: entry.label, jobId: updated.id };
    } catch (err) {
      return { ok: false, kind: entry.kind, label: entry.label, error: String(err) };
    }
  }
}
