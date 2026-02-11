import { generateId, nowISO } from "@undoable/shared";
import type { RunStatus, RunSummary, PlanGraph } from "@undoable/shared";
import type { EventBus } from "@undoable/core";

export type CreateRunInput = {
  userId: string;
  agentId: string;
  instruction: string;
};

export type RunRecord = RunSummary & {
  plan?: PlanGraph;
};

export class RunManager {
  private runs = new Map<string, RunRecord>();
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  create(input: CreateRunInput): RunRecord {
    const now = nowISO();
    const run: RunRecord = {
      id: generateId(),
      userId: input.userId,
      agentId: input.agentId,
      status: "created",
      instruction: input.instruction,
      engineVersion: "0.1.0",
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.id, run);
    this.eventBus.emit(run.id, "RUN_CREATED", { instruction: input.instruction }, input.userId);
    return run;
  }

  getById(id: string): RunRecord | undefined {
    return this.runs.get(id);
  }

  list(userId?: string): RunRecord[] {
    const all = Array.from(this.runs.values());
    if (!userId) return all;
    return all.filter((r) => r.userId === userId);
  }

  updateStatus(runId: string, status: RunStatus, userId?: string): RunRecord | undefined {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    run.status = status;
    run.updatedAt = nowISO();
    this.eventBus.emit(runId, "STATUS_CHANGED", { status }, userId);
    return run;
  }

  setPlan(runId: string, plan: PlanGraph): RunRecord | undefined {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    run.plan = plan;
    run.updatedAt = nowISO();
    return run;
  }

  delete(id: string): boolean {
    return this.runs.delete(id);
  }

  count(): number {
    return this.runs.size;
  }
}
