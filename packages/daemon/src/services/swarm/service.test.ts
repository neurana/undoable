import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { SwarmService } from "./service.js";

type FakeJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: { kind: "every" | "at" | "cron"; everyMs?: number; at?: string; expr?: string; tz?: string };
  payload: { kind: "run"; instruction: string; agentId?: string };
};

class FakeScheduler {
  private jobs = new Map<string, FakeJob>();
  private seq = 0;

  async add(input: Omit<FakeJob, "id">): Promise<FakeJob> {
    const id = `job-${++this.seq}`;
    const job: FakeJob = { id, ...input };
    this.jobs.set(id, job);
    return job;
  }

  async update(id: string, patch: Partial<FakeJob>): Promise<FakeJob> {
    const existing = this.jobs.get(id);
    if (!existing) throw new Error("unknown job");
    const updated: FakeJob = { ...existing, ...patch };
    this.jobs.set(id, updated);
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }

  count(): number {
    return this.jobs.size;
  }
}

describe("SwarmService", () => {
  let scheduler: FakeScheduler;
  let service: SwarmService;

  beforeEach(() => {
    scheduler = new FakeScheduler();
    service = new SwarmService({
      scheduler: scheduler as unknown as import("@undoable/core").SchedulerService,
      persistence: "off",
    });
  });

  it("creates scheduled nodes as scheduler jobs", async () => {
    const workflow = await service.create({
      name: "prices",
      nodes: [
        {
          id: "fetch",
          name: "fetch prices",
          schedule: { mode: "every", everySeconds: 10 },
        },
      ],
    });

    expect(workflow.nodes).toHaveLength(1);
    expect(workflow.nodes[0]?.jobId).toBeTruthy();
    expect(scheduler.count()).toBe(1);
  });

  it("rejects cyclic edges", async () => {
    const workflow = await service.create({
      name: "cycle-check",
      nodes: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
    });

    await expect(
      service.upsertEdge(workflow.id, { from: "b", to: "a" }),
    ).rejects.toThrow(/DAG|cycle/i);
  });

  it("removes mapped scheduler job when node becomes manual", async () => {
    const workflow = await service.create({
      name: "manual-shift",
      nodes: [
        {
          id: "runner",
          name: "runner",
          schedule: { mode: "cron", expr: "*/5 * * * *" },
        },
      ],
    });

    expect(scheduler.count()).toBe(1);

    await service.updateNode(workflow.id, "runner", {
      schedule: { mode: "manual" },
    });

    const updated = service.getById(workflow.id);
    expect(updated?.nodes[0]?.jobId).toBeUndefined();
    expect(scheduler.count()).toBe(0);
  });

  it("creates workflow prompt scaffold files for planner/subplanner/worker runtime", async () => {
    const workflow = await service.create({
      name: "scaffold-check",
      nodes: [{ id: "planner", name: "Planner" }],
    });

    const workspaceDir = workflow.workspaceDir;
    expect(workspaceDir).toBeTruthy();
    expect(fs.existsSync(`${workspaceDir}/ENTRY_POINT.md`)).toBe(true);
    expect(fs.existsSync(`${workspaceDir}/AGENTS.md`)).toBe(true);
    expect(fs.existsSync(`${workspaceDir}/SPEC.md`)).toBe(true);
    expect(fs.existsSync(`${workspaceDir}/DECISIONS.md`)).toBe(true);
    expect(fs.existsSync(`${workspaceDir}/RUNBOOK.md`)).toBe(true);
    expect(fs.existsSync(`${workspaceDir}/INSTRUCTIONS.md`)).toBe(true);
    expect(fs.existsSync(`${workspaceDir}/README.md`)).toBe(true);
    expect(fs.existsSync(`${workspaceDir}/infra/root-planner.md`)).toBe(true);
    expect(fs.existsSync(`${workspaceDir}/infra/subplanner.md`)).toBe(true);
    expect(fs.existsSync(`${workspaceDir}/infra/worker.md`)).toBe(true);
    expect(fs.existsSync(`${workspaceDir}/infra/reconciler.md`)).toBe(true);
  });
});
