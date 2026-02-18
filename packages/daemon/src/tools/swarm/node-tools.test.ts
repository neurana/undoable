import { beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "@undoable/core";
import { RunManager } from "../../services/run-manager.js";
import { SwarmService } from "../../services/swarm/service.js";
import { createSwarmNodeTools } from "./node-tools.js";

type FakeJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: { kind: "every" | "at" | "cron"; everyMs?: number; at?: string; expr?: string; tz?: string };
  payload: { kind: "run"; instruction: string; agentId?: string; model?: string };
  createdAtMs: number;
  updatedAtMs: number;
  state: Record<string, unknown>;
};

class FakeScheduler {
  private seq = 0;
  private jobs = new Map<string, FakeJob>();
  readonly runCalls: string[] = [];
  readonly removeCalls: string[] = [];

  async add(input: Omit<FakeJob, "id" | "createdAtMs" | "updatedAtMs" | "state">): Promise<FakeJob> {
    const id = `job-${++this.seq}`;
    const now = Date.now();
    const job: FakeJob = {
      id,
      ...input,
      createdAtMs: now,
      updatedAtMs: now,
      state: {},
    };
    this.jobs.set(id, job);
    return job;
  }

  async update(id: string, patch: Partial<FakeJob>): Promise<FakeJob> {
    const existing = this.jobs.get(id);
    if (!existing) throw new Error(`unknown job id: ${id}`);
    const updated: FakeJob = {
      ...existing,
      ...patch,
      updatedAtMs: Date.now(),
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    this.removeCalls.push(id);
    return this.jobs.delete(id);
  }

  async run(id: string): Promise<boolean> {
    if (!this.jobs.has(id)) throw new Error(`unknown job id: ${id}`);
    this.runCalls.push(id);
    return true;
  }
}

describe("createSwarmNodeTools", () => {
  let scheduler: FakeScheduler;
  let swarmService: SwarmService;
  let runManager: RunManager;
  let tools: ReturnType<typeof createSwarmNodeTools>;

  const schedulerSvc = (scheduler: FakeScheduler) =>
    scheduler as unknown as import("@undoable/core").SchedulerService;

  beforeEach(() => {
    scheduler = new FakeScheduler();
    swarmService = new SwarmService({
      scheduler: schedulerSvc(scheduler),
      persistence: "off",
    });
    runManager = new RunManager(new EventBus(), { persistence: "off" });
    tools = createSwarmNodeTools(swarmService, runManager, schedulerSvc(scheduler));
  });

  const tool = (name: string) => {
    const found = tools.find((entry) => entry.name === name);
    if (!found) throw new Error(`tool not found: ${name}`);
    return found;
  };

  it("exposes delete alias and run-node tools", () => {
    expect(tools.some((entry) => entry.name === "swarm_delete_node")).toBe(true);
    expect(tools.some((entry) => entry.name === "swarm_run_node")).toBe(true);
  });

  it("deletes nodes via swarm_delete_node alias", async () => {
    const workflow = await swarmService.create({
      name: "alias-delete",
      nodes: [{ id: "n1", name: "Node 1" }],
    });

    const result = await tool("swarm_delete_node").execute({
      workflowId: workflow.id,
      nodeId: "n1",
    }) as { deleted?: boolean };

    expect(result.deleted).toBe(true);
    const updated = swarmService.getById(workflow.id);
    expect(updated?.nodes).toHaveLength(0);
  });

  it("lists runs using synthetic job id for manual nodes", async () => {
    const workflow = await swarmService.create({
      name: "manual-runs",
      nodes: [{ id: "manual-node", name: "Manual Node", schedule: { mode: "manual" } }],
    });

    const syntheticJobId = "swarm-node-manual-node";
    runManager.create({
      userId: "swarm",
      agentId: "default",
      instruction: "manual execution",
      jobId: syntheticJobId,
    });

    const result = await tool("swarm_list_node_runs").execute({
      workflowId: workflow.id,
      nodeId: "manual-node",
    }) as { jobId?: string | null; runs?: unknown[] };

    expect(result.jobId).toBe(syntheticJobId);
    expect(result.runs).toHaveLength(1);
  });

  it("runs scheduled nodes against existing scheduler job", async () => {
    const workflow = await swarmService.create({
      name: "scheduled-run",
      nodes: [
        {
          id: "scheduled-node",
          name: "Scheduled Node",
          schedule: { mode: "every", everySeconds: 30 },
        },
      ],
    });

    const node = swarmService.getById(workflow.id)?.nodes.find((entry) => entry.id === "scheduled-node");
    expect(node?.jobId).toBeTruthy();

    const result = await tool("swarm_run_node").execute({
      workflowId: workflow.id,
      nodeId: "scheduled-node",
    }) as { ran?: boolean; temporaryJob?: boolean };

    expect(result.ran).toBe(true);
    expect(result.temporaryJob).toBe(false);
    expect(scheduler.runCalls).toEqual([node?.jobId]);
  });

  it("runs manual nodes via temporary one-time scheduler job", async () => {
    const workflow = await swarmService.create({
      name: "manual-run",
      nodes: [{ id: "manual-node", name: "Manual Node", schedule: { mode: "manual" } }],
    });

    const result = await tool("swarm_run_node").execute({
      workflowId: workflow.id,
      nodeId: "manual-node",
    }) as { ran?: boolean; temporaryJob?: boolean; jobId?: string };

    expect(result.ran).toBe(true);
    expect(result.temporaryJob).toBe(true);
    expect(result.jobId).toBeTruthy();
    expect(scheduler.runCalls).toEqual([result.jobId]);
    expect(scheduler.removeCalls).toEqual([result.jobId]);
  });
});
