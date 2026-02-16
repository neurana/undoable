import type { SchedulerEvent } from "@undoable/core";

export type CronRunEntry = {
  jobId: string;
  runAtMs: number;
  durationMs?: number;
  status?: "ok" | "error" | "skipped";
  error?: string;
};

const DEFAULT_LIMIT = 20;
const MAX_ENTRIES = 1000;

export class CronRunLogService {
  private entries: CronRunEntry[] = [];

  append(event: SchedulerEvent): void {
    if (event.action !== "finished") return;
    this.entries.push({
      jobId: event.jobId,
      runAtMs: event.runAtMs ?? Date.now(),
      durationMs: event.durationMs,
      status: event.status,
      error: event.error,
    });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_ENTRIES);
    }
  }

  list(jobId: string, limit = DEFAULT_LIMIT): CronRunEntry[] {
    const bounded = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : DEFAULT_LIMIT;
    const filtered = this.entries.filter((entry) => entry.jobId === jobId);
    return filtered.slice(-bounded).reverse();
  }
}
