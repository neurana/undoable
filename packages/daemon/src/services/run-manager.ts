import { generateId, nowISO } from "@undoable/shared";
import type { EventEnvelope, RunStatus, RunSummary, PlanGraph } from "@undoable/shared";
import type { EventBus } from "@undoable/core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type CreateRunInput = {
  userId: string;
  agentId: string;
  instruction: string;
  jobId?: string;
};

export type RunRecord = RunSummary & {
  plan?: PlanGraph;
};

type RunManagerPersistenceMode = "on" | "off";

type RunManagerOptions = {
  persistence?: RunManagerPersistenceMode;
  stateFilePath?: string;
};

type PersistedRunState = {
  version: 1;
  runs: RunRecord[];
  eventLogs: Array<{ runId: string; events: EventEnvelope[] }>;
  savedAt: string;
};

const DEFAULT_STATE_FILE = path.join(os.homedir(), ".undoable", "runs-state.json");
const MAX_EVENTS_PER_RUN = 4_000;
const IN_PROGRESS_STATUSES = new Set<RunStatus>([
  "planning",
  "planned",
  "shadowing",
  "shadowed",
  "approval_required",
  "applying",
  "undoing",
]);

export class RunManager {
  private runs = new Map<string, RunRecord>();
  private eventLogs = new Map<string, EventEnvelope[]>();
  private eventBus: EventBus;
  private readonly persistenceEnabled: boolean;
  private readonly stateFilePath: string;
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(eventBus: EventBus, opts?: RunManagerOptions) {
    this.eventBus = eventBus;
    const defaultMode: RunManagerPersistenceMode = process.env.NODE_ENV === "test" ? "off" : "on";
    this.persistenceEnabled = (opts?.persistence ?? defaultMode) === "on";
    this.stateFilePath = opts?.stateFilePath ?? DEFAULT_STATE_FILE;
    this.restoreFromDisk();
  }

  appendEvent(runId: string, event: EventEnvelope): void {
    let log = this.eventLogs.get(runId);
    if (!log) {
      log = [];
      this.eventLogs.set(runId, log);
    }
    log.push(event);
    if (log.length > MAX_EVENTS_PER_RUN) {
      log.splice(0, log.length - MAX_EVENTS_PER_RUN);
    }
    this.schedulePersist();
  }

  getEvents(runId: string): EventEnvelope[] {
    return this.eventLogs.get(runId) ?? [];
  }

  create(input: CreateRunInput): RunRecord {
    const now = nowISO();
    const run: RunRecord = {
      id: generateId(),
      userId: input.userId,
      agentId: input.agentId,
      status: "created",
      instruction: input.instruction,
      jobId: input.jobId,
      engineVersion: "0.1.0",
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.id, run);
    this.eventBus.emit(run.id, "RUN_CREATED", { instruction: input.instruction }, input.userId);
    this.persistNow();
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

  listByJobId(jobId: string): RunRecord[] {
    return Array.from(this.runs.values()).filter((r) => r.jobId === jobId);
  }

  updateStatus(runId: string, status: RunStatus, userId?: string): RunRecord | undefined {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    run.status = status;
    run.updatedAt = nowISO();
    this.eventBus.emit(runId, "STATUS_CHANGED", { status }, userId);
    this.persistNow();
    return run;
  }

  setPlan(runId: string, plan: PlanGraph): RunRecord | undefined {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    run.plan = plan;
    run.updatedAt = nowISO();
    this.persistNow();
    return run;
  }

  delete(id: string): boolean {
    this.eventLogs.delete(id);
    const deleted = this.runs.delete(id);
    if (deleted) this.persistNow();
    return deleted;
  }

  count(): number {
    return this.runs.size;
  }

  private restoreFromDisk(): void {
    if (!this.persistenceEnabled) return;
    try {
      if (!fs.existsSync(this.stateFilePath)) return;
      const raw = fs.readFileSync(this.stateFilePath, "utf-8").trim();
      if (!raw) return;

      const parsed = JSON.parse(raw) as PersistedRunState;
      const now = nowISO();
      let restoredAny = false;

      if (Array.isArray(parsed.runs)) {
        for (const run of parsed.runs) {
          if (!run || typeof run.id !== "string") continue;
          const recovered: RunRecord = {
            ...run,
            status: IN_PROGRESS_STATUSES.has(run.status) ? "failed" : run.status,
            updatedAt: IN_PROGRESS_STATUSES.has(run.status) ? now : run.updatedAt,
          };
          this.runs.set(recovered.id, recovered);
          restoredAny = true;
        }
      }

      if (Array.isArray(parsed.eventLogs)) {
        for (const entry of parsed.eventLogs) {
          if (!entry || typeof entry.runId !== "string" || !Array.isArray(entry.events)) continue;
          const events = entry.events.slice(-MAX_EVENTS_PER_RUN);
          this.eventLogs.set(entry.runId, events);
          restoredAny = true;
        }
      }
      if (restoredAny) this.persistNow();
    } catch {
      // best effort restore; ignore corrupt snapshots
    }
  }

  private schedulePersist(): void {
    if (!this.persistenceEnabled || this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow();
    }, 200);
  }

  private persistNow(): void {
    if (!this.persistenceEnabled) return;
    try {
      if (this.persistTimer) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
      }

      const dir = path.dirname(this.stateFilePath);
      fs.mkdirSync(dir, { recursive: true });
      const state: PersistedRunState = {
        version: 1,
        runs: [...this.runs.values()],
        eventLogs: [...this.eventLogs.entries()].map(([runId, events]) => ({ runId, events })),
        savedAt: nowISO(),
      };

      const tempPath = `${this.stateFilePath}.tmp`;
      fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
      fs.renameSync(tempPath, this.stateFilePath);
      try {
        fs.chmodSync(this.stateFilePath, 0o600);
      } catch {
        // best effort
      }
    } catch {
      // best effort persistence; never break run lifecycle
    }
  }
}
