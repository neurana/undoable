import { describe, expect, it } from "vitest";
import { EventBus } from "@undoable/core";
import { RunManager } from "../run-manager.js";
import { SwarmOrchestrator } from "./orchestrator.js";
import type { SwarmWorkflow, SwarmWorkflowNode } from "./types.js";

function buildNode(id: string): SwarmWorkflowNode {
  const now = new Date().toISOString();
  return {
    id,
    name: id.toUpperCase(),
    type: "agent_task",
    prompt: `Run node ${id}`,
    agentId: "default",
    skillRefs: [],
    schedule: { mode: "manual" },
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function buildWorkflow(params: {
  id: string;
  nodes: string[];
  edges?: Array<{ from: string; to: string }>;
}): SwarmWorkflow {
  const now = new Date().toISOString();
  return {
    id: params.id,
    name: params.id,
    orchestratorAgentId: "default",
    enabled: true,
    version: 1,
    nodes: params.nodes.map((id) => buildNode(id)),
    edges: params.edges ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

describe("SwarmOrchestrator", () => {
  it("runs roots in parallel and unlocks dependent nodes after completion", () => {
    const eventBus = new EventBus();
    const runManager = new RunManager(eventBus, { persistence: "off" });

    const orchestrator = new SwarmOrchestrator({
      runManager,
      eventBus,
      maxParallelDefault: 2,
      startNodeRun: (_workflow, node) => {
        const run = runManager.create({
          userId: "swarm",
          agentId: node.agentId ?? "default",
          instruction: node.prompt ?? `Run ${node.id}`,
          jobId: node.jobId ?? `swarm-node-${node.id}`,
        });
        return {
          nodeId: node.id,
          runId: run.id,
          jobId: run.jobId ?? `swarm-node-${node.id}`,
          agentId: run.agentId,
        };
      },
    });

    const workflow = buildWorkflow({
      id: "wf-dag",
      nodes: ["a", "b", "c", "d"],
      edges: [
        { from: "a", to: "c" },
        { from: "b", to: "c" },
        { from: "c", to: "d" },
      ],
    });

    const started = orchestrator.start(workflow, {
      allowConcurrent: true,
      maxParallel: 2,
    });

    expect(started.launched.map((entry) => entry.nodeId).sort()).toEqual(["a", "b"]);
    expect(started.status).toBe("running");

    const runA = started.launched.find((entry) => entry.nodeId === "a")?.runId;
    const runB = started.launched.find((entry) => entry.nodeId === "b")?.runId;
    expect(runA).toBeTruthy();
    expect(runB).toBeTruthy();

    runManager.updateStatus(runA!, "completed", "swarm");
    let current = orchestrator.get(started.id)!;
    expect(current.launched.some((entry) => entry.nodeId === "c")).toBe(false);

    runManager.updateStatus(runB!, "completed", "swarm");
    current = orchestrator.get(started.id)!;
    expect(current.launched.some((entry) => entry.nodeId === "c")).toBe(true);

    const runC = current.launched.find((entry) => entry.nodeId === "c")?.runId;
    expect(runC).toBeTruthy();
    runManager.updateStatus(runC!, "completed", "swarm");

    current = orchestrator.get(started.id)!;
    expect(current.launched.some((entry) => entry.nodeId === "d")).toBe(true);

    const runD = current.launched.find((entry) => entry.nodeId === "d")?.runId;
    expect(runD).toBeTruthy();
    runManager.updateStatus(runD!, "completed", "swarm");

    const completed = orchestrator.get(started.id)!;
    expect(completed.status).toBe("completed");
    expect(completed.nodes.every((node) => node.status === "completed")).toBe(true);
  });

  it("fails fast and blocks downstream nodes when dependency fails", () => {
    const eventBus = new EventBus();
    const runManager = new RunManager(eventBus, { persistence: "off" });

    const orchestrator = new SwarmOrchestrator({
      runManager,
      eventBus,
      startNodeRun: (_workflow, node) => {
        const run = runManager.create({
          userId: "swarm",
          agentId: node.agentId ?? "default",
          instruction: node.prompt ?? `Run ${node.id}`,
          jobId: node.jobId ?? `swarm-node-${node.id}`,
        });
        return {
          nodeId: node.id,
          runId: run.id,
          jobId: run.jobId ?? `swarm-node-${node.id}`,
          agentId: run.agentId,
        };
      },
    });

    const workflow = buildWorkflow({
      id: "wf-fail-fast",
      nodes: ["a", "b", "c"],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    });

    const started = orchestrator.start(workflow, { failFast: true });
    expect(started.launched).toHaveLength(1);
    expect(started.launched[0]?.nodeId).toBe("a");

    runManager.updateStatus(started.launched[0]!.runId, "failed", "swarm");

    const failed = orchestrator.get(started.id)!;
    expect(failed.status).toBe("failed");
    const b = failed.nodes.find((node) => node.nodeId === "b");
    const c = failed.nodes.find((node) => node.nodeId === "c");
    expect(b?.status).toBe("blocked");
    expect(c?.status).toBe("blocked");
  });

  it("skips nodes with active runs when allowConcurrent=false", () => {
    const eventBus = new EventBus();
    const runManager = new RunManager(eventBus, { persistence: "off" });

    const activeRun = runManager.create({
      userId: "swarm",
      agentId: "default",
      instruction: "active node",
      jobId: "swarm-node-a",
    });
    runManager.updateStatus(activeRun.id, "planning", "swarm");

    const orchestrator = new SwarmOrchestrator({
      runManager,
      eventBus,
      startNodeRun: (_workflow, node) => {
        const run = runManager.create({
          userId: "swarm",
          agentId: node.agentId ?? "default",
          instruction: node.prompt ?? `Run ${node.id}`,
          jobId: node.jobId ?? `swarm-node-${node.id}`,
        });
        return {
          nodeId: node.id,
          runId: run.id,
          jobId: run.jobId ?? `swarm-node-${node.id}`,
          agentId: run.agentId,
        };
      },
    });

    const workflow = buildWorkflow({
      id: "wf-active-guard",
      nodes: ["a"],
    });

    const started = orchestrator.start(workflow, { allowConcurrent: false });
    expect(started.launched).toHaveLength(0);
    expect(started.skipped).toHaveLength(1);
    expect(started.skipped[0]?.nodeId).toBe("a");
    expect(started.skipped[0]?.reason).toBe("node already has an active run");
    expect(started.status).toBe("completed");
  });
});
