import type {
  ScheduledJob,
  JobCreate,
  JobPatch,
  SchedulerConfig,
  SchedulerEvent,
  JobExecutor,
  JobStoreFile,
} from "./types.js";
import { loadStore, saveStore, createJob, applyPatch, recomputeAllNextRuns } from "./store.js";
import { type TimerState, armTimer, clearTimer, runMissedJobs, runSingleJob } from "./timer.js";

export type SchedulerServiceDeps = {
  config: SchedulerConfig;
  executor: JobExecutor;
  nowMs?: () => number;
  onEvent?: (evt: SchedulerEvent) => void;
};

export type SchedulerStatus = {
  enabled: boolean;
  storePath: string;
  jobCount: number;
  nextWakeAtMs: number | null;
};

export class SchedulerService {
  private store: JobStoreFile | null = null;
  private timerState: TimerState;
  private deps: SchedulerServiceDeps;
  private op: Promise<unknown> = Promise.resolve();

  constructor(deps: SchedulerServiceDeps) {
    this.deps = deps;
    this.timerState = {
      jobs: [],
      timer: null,
      running: false,
      enabled: deps.config.enabled,
      nowMs: deps.nowMs ?? (() => Date.now()),
      executor: deps.executor,
      onEvent: deps.onEvent,
      onPersist: () => this.persist(),
    };
  }

  async start(): Promise<void> {
    await this.locked(async () => {
      await this.ensureLoaded();
      this.clearStaleRunMarkers();
      await runMissedJobs(this.timerState);
      recomputeAllNextRuns(this.timerState.jobs, this.timerState.nowMs());
      await this.persist();
      armTimer(this.timerState);
    });
  }

  stop(): void {
    clearTimer(this.timerState);
  }

  async status(): Promise<SchedulerStatus> {
    return this.locked(async () => {
      await this.ensureLoaded();
      return {
        enabled: this.deps.config.enabled,
        storePath: this.deps.config.storePath,
        jobCount: this.timerState.jobs.length,
        nextWakeAtMs: this.computeNextWake(),
      };
    });
  }

  async list(opts?: { includeDisabled?: boolean }): Promise<ScheduledJob[]> {
    return this.locked(async () => {
      await this.ensureLoaded();
      const jobs = opts?.includeDisabled
        ? this.timerState.jobs
        : this.timerState.jobs.filter((j) => j.enabled);
      return [...jobs].sort(
        (a, b) => (a.state.nextRunAtMs ?? Infinity) - (b.state.nextRunAtMs ?? Infinity),
      );
    });
  }

  async add(input: JobCreate): Promise<ScheduledJob> {
    return this.locked(async () => {
      await this.ensureLoaded();
      const job = createJob(input, this.timerState.nowMs());
      this.timerState.jobs.push(job);
      await this.persist();
      armTimer(this.timerState);
      this.deps.onEvent?.({ jobId: job.id, action: "added", nextRunAtMs: job.state.nextRunAtMs });
      return job;
    });
  }

  async update(id: string, patch: JobPatch): Promise<ScheduledJob> {
    return this.locked(async () => {
      await this.ensureLoaded();
      const idx = this.timerState.jobs.findIndex((j) => j.id === id);
      if (idx < 0) throw new Error(`unknown job id: ${id}`);
      const updated = applyPatch(this.timerState.jobs[idx]!, patch, this.timerState.nowMs());
      this.timerState.jobs[idx] = updated;
      await this.persist();
      armTimer(this.timerState);
      this.deps.onEvent?.({ jobId: id, action: "updated", nextRunAtMs: updated.state.nextRunAtMs });
      return updated;
    });
  }

  async remove(id: string): Promise<boolean> {
    return this.locked(async () => {
      await this.ensureLoaded();
      const idx = this.timerState.jobs.findIndex((j) => j.id === id);
      if (idx < 0) return false;
      this.timerState.jobs.splice(idx, 1);
      await this.persist();
      armTimer(this.timerState);
      this.deps.onEvent?.({ jobId: id, action: "removed" });
      return true;
    });
  }

  async run(id: string, mode: "due" | "force" = "due"): Promise<boolean> {
    return this.locked(async () => {
      await this.ensureLoaded();
      const job = this.timerState.jobs.find((j) => j.id === id);
      if (!job) throw new Error(`unknown job id: ${id}`);
      return runSingleJob(this.timerState, job, mode === "force");
    });
  }

  private async ensureLoaded(): Promise<void> {
    if (this.store) {
      this.timerState.jobs = this.store.jobs;
      return;
    }
    this.store = await loadStore(this.deps.config.storePath);
    this.timerState.jobs = this.store.jobs;
  }

  private async persist(): Promise<void> {
    if (!this.store) return;
    this.store.jobs = this.timerState.jobs;
    await saveStore(this.deps.config.storePath, this.store);
  }

  private clearStaleRunMarkers(): void {
    for (const job of this.timerState.jobs) {
      if (typeof job.state.runningAtMs === "number") {
        job.state.runningAtMs = undefined;
      }
    }
  }

  private computeNextWake(): number | null {
    if (!this.deps.config.enabled) return null;
    let min: number | undefined;
    for (const job of this.timerState.jobs) {
      if (!job.enabled) continue;
      const next = job.state.nextRunAtMs;
      if (typeof next === "number" && (min === undefined || next < min)) {
        min = next;
      }
    }
    return min ?? null;
  }

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.op.then(fn, fn);
    this.op = next.catch(() => {});
    return next;
  }
}
