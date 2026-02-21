import type { FastifyInstance } from "fastify";
import type { EventBus } from "@undoable/core";
import type { RunManager } from "../services/run-manager.js";
import { executeRun, type RunExecutorDeps } from "../services/run-executor.js";
import type {
  CreateSwarmNodeInput,
  CreateSwarmWorkflowInput,
  SwarmEdge,
  SwarmOrchestrationRecord,
  SwarmService,
  SwarmWorkflowRunInput,
  UpdateSwarmNodePatch,
  UpdateSwarmWorkflowPatch,
} from "../services/swarm-service.js";
import { SwarmOrchestrator } from "../services/swarm-service.js";

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type SwarmNodeLaunchResult = {
  nodeId: string;
  runId: string;
  jobId: string;
  agentId: string;
};

function startNodeRun(
  runManager: RunManager,
  workflowName: string,
  node: { id: string; name: string; prompt?: string; jobId?: string; agentId?: string },
  extra?: SwarmRouteDeps,
): SwarmNodeLaunchResult {
  const instruction =
    node.prompt ||
    `Execute SWARM node "${node.name}" from workflow "${workflowName}".`;
  const jobId = node.jobId ?? `swarm-node-${node.id}`;
  const agentId = node.agentId ?? "default";

  const run = runManager.create({
    userId: "swarm",
    agentId,
    instruction,
    jobId,
  });

  if (extra?.executorDeps && extra.eventBus) {
    const deps: RunExecutorDeps = {
      ...extra.executorDeps,
      runManager,
      eventBus: extra.eventBus,
      sessionId: `swarm-node-${node.id}`,
    };
    executeRun(run.id, instruction, deps).catch(() => {});
  }

  return {
    nodeId: node.id,
    runId: run.id,
    jobId,
    agentId,
  };
}

function summarizeOrchestration(orchestration: SwarmOrchestrationRecord) {
  const pendingNodes = orchestration.nodes
    .filter((node) => node.status === "pending" || node.status === "running")
    .map((node) => node.nodeId);
  const failedNodes = orchestration.nodes
    .filter((node) => node.status === "failed" || node.status === "cancelled")
    .map((node) => node.nodeId);
  const blockedNodes = orchestration.nodes
    .filter((node) => node.status === "blocked")
    .map((node) => node.nodeId);

  return {
    orchestrationId: orchestration.id,
    status: orchestration.status,
    launched: orchestration.launched,
    skipped: orchestration.skipped,
    pendingNodes,
    failedNodes,
    blockedNodes,
    options: orchestration.options,
    startedAt: orchestration.startedAt,
    completedAt: orchestration.completedAt,
  };
}

export type SwarmRouteDeps = {
  eventBus?: EventBus;
  executorDeps?: Omit<RunExecutorDeps, "runManager" | "eventBus">;
};

export function swarmRoutes(
  app: FastifyInstance,
  swarmService: SwarmService,
  runManager: RunManager,
  extra?: SwarmRouteDeps,
) {
  const orchestrator = new SwarmOrchestrator({
    runManager,
    eventBus: extra?.eventBus,
    startNodeRun: (workflow, node) =>
      startNodeRun(runManager, workflow.name, node, extra),
  });

  app.get("/swarm/workflows", async () => {
    return swarmService.list();
  });

  app.get<{ Params: { id: string } }>("/swarm/workflows/:id", async (req, reply) => {
    const workflow = swarmService.getById(req.params.id);
    if (!workflow) {
      return reply.code(404).send({ error: "Workflow not found" });
    }
    return workflow;
  });

  app.post<{ Body: CreateSwarmWorkflowInput }>("/swarm/workflows", async (req, reply) => {
    try {
      const created = await swarmService.create(req.body);
      return reply.code(201).send(created);
    } catch (err) {
      return reply.code(400).send({ error: toErrorMessage(err) });
    }
  });

  app.patch<{ Params: { id: string }; Body: UpdateSwarmWorkflowPatch }>("/swarm/workflows/:id", async (req, reply) => {
    try {
      const updated = await swarmService.update(req.params.id, req.body);
      if (!updated) {
        return reply.code(404).send({ error: "Workflow not found" });
      }
      return updated;
    } catch (err) {
      return reply.code(400).send({ error: toErrorMessage(err) });
    }
  });

  app.delete<{ Params: { id: string } }>("/swarm/workflows/:id", async (req, reply) => {
    const deleted = await swarmService.delete(req.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: "Workflow not found" });
    }
    return { deleted: true };
  });

  app.post<{ Params: { id: string }; Body: CreateSwarmNodeInput }>("/swarm/workflows/:id/nodes", async (req, reply) => {
    try {
      const node = await swarmService.addNode(req.params.id, req.body);
      if (!node) {
        return reply.code(404).send({ error: "Workflow not found" });
      }
      return reply.code(201).send(node);
    } catch (err) {
      return reply.code(400).send({ error: toErrorMessage(err) });
    }
  });

  app.patch<{ Params: { id: string; nodeId: string }; Body: UpdateSwarmNodePatch }>("/swarm/workflows/:id/nodes/:nodeId", async (req, reply) => {
    try {
      const node = await swarmService.updateNode(req.params.id, req.params.nodeId, req.body);
      if (!node) {
        return reply.code(404).send({ error: "Workflow or node not found" });
      }
      return node;
    } catch (err) {
      return reply.code(400).send({ error: toErrorMessage(err) });
    }
  });

  app.delete<{ Params: { id: string; nodeId: string } }>("/swarm/workflows/:id/nodes/:nodeId", async (req, reply) => {
    const deleted = await swarmService.removeNode(req.params.id, req.params.nodeId);
    if (!deleted) {
      return reply.code(404).send({ error: "Workflow or node not found" });
    }
    return { deleted: true };
  });

  app.put<{ Params: { id: string }; Body: { edges: SwarmEdge[] } }>("/swarm/workflows/:id/edges", async (req, reply) => {
    try {
      const edges = Array.isArray(req.body?.edges) ? req.body.edges : [];
      const workflow = await swarmService.setEdges(req.params.id, edges);
      if (!workflow) {
        return reply.code(404).send({ error: "Workflow not found" });
      }
      return workflow;
    } catch (err) {
      return reply.code(400).send({ error: toErrorMessage(err) });
    }
  });

  app.post<{ Params: { id: string }; Body: SwarmEdge }>("/swarm/workflows/:id/edges", async (req, reply) => {
    try {
      const workflow = await swarmService.upsertEdge(req.params.id, req.body);
      if (!workflow) {
        return reply.code(404).send({ error: "Workflow not found" });
      }
      return workflow;
    } catch (err) {
      return reply.code(400).send({ error: toErrorMessage(err) });
    }
  });

  app.delete<{ Params: { id: string }; Querystring: { from: string; to: string } }>("/swarm/workflows/:id/edges", async (req, reply) => {
    const from = req.query.from;
    const to = req.query.to;
    if (!from || !to) {
      return reply.code(400).send({ error: "from and to are required" });
    }

    const removed = await swarmService.removeEdge(req.params.id, from, to);
    if (!removed) {
      return reply.code(404).send({ error: "Workflow or edge not found" });
    }

    return { deleted: true };
  });

  app.get<{ Params: { id: string; nodeId: string } }>("/swarm/workflows/:id/nodes/:nodeId/runs", async (req, reply) => {
    const workflow = swarmService.getById(req.params.id);
    if (!workflow) {
      return reply.code(404).send({ error: "Workflow not found" });
    }

    const node = workflow.nodes.find((entry) => entry.id === req.params.nodeId);
    if (!node) {
      return reply.code(404).send({ error: "Node not found" });
    }

    const syntheticJobId = `swarm-node-${node.id}`;
    const runs = node.jobId
      ? runManager.listByJobId(node.jobId)
      : runManager.listByJobId(syntheticJobId);

    return { jobId: node.jobId ?? syntheticJobId, runs };
  });

  app.post<{ Params: { id: string; nodeId: string } }>("/swarm/workflows/:id/nodes/:nodeId/run", async (req, reply) => {
    const workflow = swarmService.getById(req.params.id);
    if (!workflow) {
      return reply.code(404).send({ error: "Workflow not found" });
    }

    const node = workflow.nodes.find((entry) => entry.id === req.params.nodeId);
    if (!node) {
      return reply.code(404).send({ error: "Node not found" });
    }

    const started = startNodeRun(runManager, workflow.name, node, extra);
    const run = runManager.getById(started.runId);
    return reply.code(201).send(run);
  });

  app.post<{ Params: { id: string }; Body: SwarmWorkflowRunInput }>("/swarm/workflows/:id/run", async (req, reply) => {
    const workflow = swarmService.getById(req.params.id);
    if (!workflow) {
      return reply.code(404).send({ error: "Workflow not found" });
    }

    try {
      const orchestration = orchestrator.start(workflow, req.body ?? {});
      return reply.code(201).send({
        workflowId: workflow.id,
        ...summarizeOrchestration(orchestration),
      });
    } catch (err) {
      return reply.code(400).send({ error: toErrorMessage(err) });
    }
  });

  app.get<{ Params: { id: string } }>("/swarm/workflows/:id/orchestrations", async (req, reply) => {
    const workflow = swarmService.getById(req.params.id);
    if (!workflow) {
      return reply.code(404).send({ error: "Workflow not found" });
    }

    return {
      workflowId: workflow.id,
      orchestrations: orchestrator
        .listByWorkflow(workflow.id)
        .map((entry) => summarizeOrchestration(entry)),
    };
  });

  app.get<{ Params: { id: string; orchestrationId: string } }>("/swarm/workflows/:id/orchestrations/:orchestrationId", async (req, reply) => {
    const workflow = swarmService.getById(req.params.id);
    if (!workflow) {
      return reply.code(404).send({ error: "Workflow not found" });
    }

    const orchestration = orchestrator.get(req.params.orchestrationId);
    if (!orchestration || orchestration.workflowId !== workflow.id) {
      return reply.code(404).send({ error: "Orchestration not found" });
    }

    return {
      workflowId: workflow.id,
      ...summarizeOrchestration(orchestration),
      nodes: orchestration.nodes,
    };
  });
}
