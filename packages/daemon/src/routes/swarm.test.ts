import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { SchedulerService } from "@undoable/core";
import { EventBus } from "@undoable/core";
import { RunManager } from "../services/run-manager.js";
import { SwarmService } from "../services/swarm/service.js";
import { swarmRoutes } from "./swarm.js";

class FakeScheduler {
  private seq = 0;

  async add(input: Record<string, unknown>) {
    const id = `job-${++this.seq}`;
    return { id, ...input };
  }

  async update(id: string, patch: Record<string, unknown>) {
    return {
      id,
      name: "swarm-node",
      enabled: true,
      schedule: { kind: "every", everyMs: 60_000 },
      payload: { kind: "run", instruction: "noop" },
      ...patch,
    };
  }

  async remove(_id: string) {
    return true;
  }
}

describe("swarm routes", () => {
  let app: ReturnType<typeof Fastify>;
  let swarmService: SwarmService;
  let runManager: RunManager;
  let eventBus: EventBus;

  beforeEach(async () => {
    app = Fastify();
    swarmService = new SwarmService({
      scheduler: new FakeScheduler() as unknown as SchedulerService,
      persistence: "off",
    });
    eventBus = new EventBus();
    runManager = new RunManager(eventBus, { persistence: "off" });
    swarmRoutes(app, swarmService, runManager, { eventBus });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("runs all enabled workflow nodes in one call", async () => {
    const workflow = await swarmService.create({
      name: "parallel-workflow",
      nodes: [
        { id: "a", name: "A", enabled: true },
        { id: "b", name: "B", enabled: true },
        { id: "c", name: "C", enabled: false },
      ],
    });

    const res = await app.inject({
      method: "POST",
      url: `/swarm/workflows/${workflow.id}/run`,
      payload: {},
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      launched: Array<{ nodeId: string; runId: string }>;
      skipped: Array<{ nodeId: string; reason: string }>;
    };

    expect(body.launched).toHaveLength(2);
    expect(body.launched.map((entry) => entry.nodeId).sort()).toEqual(["a", "b"]);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0]).toMatchObject({ nodeId: "c", reason: "node is disabled" });
  });

  it("skips active nodes when allowConcurrent=false", async () => {
    const workflow = await swarmService.create({
      name: "active-guard",
      nodes: [{ id: "runner", name: "Runner", enabled: true }],
    });

    const first = await app.inject({
      method: "POST",
      url: `/swarm/workflows/${workflow.id}/run`,
      payload: {},
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: `/swarm/workflows/${workflow.id}/run`,
      payload: {},
    });
    expect(second.statusCode).toBe(201);

    const body = second.json() as {
      launched: Array<unknown>;
      skipped: Array<{ nodeId: string; reason: string; activeRunId?: string }>;
    };

    expect(body.launched).toHaveLength(0);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0]?.nodeId).toBe("runner");
    expect(body.skipped[0]?.reason).toBe("node already has an active run");
    expect(body.skipped[0]?.activeRunId).toBeTruthy();
  });

  it("orchestrates dependency graph and unlocks downstream nodes on completion", async () => {
    const workflow = await swarmService.create({
      name: "dag-workflow",
      nodes: [
        { id: "a", name: "A", enabled: true },
        { id: "b", name: "B", enabled: true },
        { id: "c", name: "C", enabled: true },
      ],
      edges: [
        { from: "a", to: "c" },
        { from: "b", to: "c" },
      ],
    });

    const res = await app.inject({
      method: "POST",
      url: `/swarm/workflows/${workflow.id}/run`,
      payload: { allowConcurrent: true, maxParallel: 2 },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      orchestrationId: string;
      launched: Array<{ nodeId: string; runId: string }>;
      pendingNodes: string[];
    };

    expect(body.launched.map((entry) => entry.nodeId).sort()).toEqual(["a", "b"]);
    expect(body.pendingNodes).toContain("c");

    const runA = body.launched.find((entry) => entry.nodeId === "a")?.runId;
    const runB = body.launched.find((entry) => entry.nodeId === "b")?.runId;
    expect(runA).toBeTruthy();
    expect(runB).toBeTruthy();

    runManager.updateStatus(runA!, "completed", "swarm");
    let orchestrationRes = await app.inject({
      method: "GET",
      url: `/swarm/workflows/${workflow.id}/orchestrations/${body.orchestrationId}`,
    });
    let orchestration = orchestrationRes.json() as {
      launched: Array<{ nodeId: string }>;
      pendingNodes: string[];
    };
    expect(orchestration.launched.some((entry) => entry.nodeId === "c")).toBe(false);
    expect(orchestration.pendingNodes).toContain("c");

    runManager.updateStatus(runB!, "completed", "swarm");
    orchestrationRes = await app.inject({
      method: "GET",
      url: `/swarm/workflows/${workflow.id}/orchestrations/${body.orchestrationId}`,
    });
    orchestration = orchestrationRes.json() as {
      launched: Array<{ nodeId: string }>;
      pendingNodes: string[];
    };
    expect(orchestration.launched.some((entry) => entry.nodeId === "c")).toBe(true);
    expect(orchestration.pendingNodes).toContain("c");
  });
});
