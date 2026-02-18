import type { FastifyInstance } from "fastify";
import type { EventBus } from "@undoable/core";
import type { RunManager } from "../services/run-manager.js";
import { executeRun, type RunExecutorDeps } from "../services/run-executor.js";
import type {
  CreateSwarmNodeInput,
  CreateSwarmWorkflowInput,
  SwarmEdge,
  SwarmService,
  UpdateSwarmNodePatch,
  UpdateSwarmWorkflowPatch,
} from "../services/swarm-service.js";

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const ACTIVE_RUN_STATUSES = new Set([
  "created",
  "planning",
  "planned",
  "shadowing",
  "shadowed",
  "approval_required",
  "applying",
  "running",
  "undoing",
]);

type SwarmWorkflowRunBody = {
  nodeIds?: string[];
  includeDisabled?: boolean;
  allowConcurrent?: boolean;
};

type SwarmNodeLaunchResult = {
  nodeId: string;
  runId: string;
  jobId: string;
  agentId: string;
};

type SwarmNodeSkipResult = {
  nodeId: string;
  reason: string;
  activeRunId?: string;
};

function startNodeRun(
  runManager: RunManager,
  workflowName: string,
  node: { id: string; name: string; prompt?: string; jobId?: string; agentId?: string },
  extra?: SwarmRouteDeps,
): SwarmNodeLaunchResult {
  const instruction = node.prompt || `Execute SWARM node "${node.name}" from workflow "${workflowName}".`;
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

export type SwarmRouteDeps = {
  eventBus: EventBus;
  executorDeps?: Omit<RunExecutorDeps, "runManager" | "eventBus">;
};

export function swarmRoutes(
  app: FastifyInstance,
  swarmService: SwarmService,
  runManager: RunManager,
  extra?: SwarmRouteDeps,
) {
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

  app.post<{ Params: { id: string }; Body: SwarmWorkflowRunBody }>("/swarm/workflows/:id/run", async (req, reply) => {
    const workflow = swarmService.getById(req.params.id);
    if (!workflow) {
      return reply.code(404).send({ error: "Workflow not found" });
    }

    const body = req.body ?? {};
    const allowConcurrent = body.allowConcurrent === true;
    const includeDisabled = body.includeDisabled === true;
    const requestedNodeIds = Array.isArray(body.nodeIds)
      ? [...new Set(body.nodeIds.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean))]
      : [];

    const skipped: SwarmNodeSkipResult[] = [];
    const launched: SwarmNodeLaunchResult[] = [];
    const nodeById = new Map(workflow.nodes.map((node) => [node.id, node] as const));

    const nodes = requestedNodeIds.length > 0
      ? requestedNodeIds.map((nodeId) => {
        const node = nodeById.get(nodeId);
        if (!node) {
          skipped.push({ nodeId, reason: "node not found" });
          return null;
        }
        return node;
      }).filter((node): node is (typeof workflow.nodes)[number] => node !== null)
      : workflow.nodes;

    for (const node of nodes) {
      if (!node.enabled && !includeDisabled) {
        skipped.push({ nodeId: node.id, reason: "node is disabled" });
        continue;
      }

      const jobId = node.jobId ?? `swarm-node-${node.id}`;
      if (!allowConcurrent) {
        const activeRun = runManager.listByJobId(jobId).find((run) => ACTIVE_RUN_STATUSES.has(run.status));
        if (activeRun) {
          skipped.push({
            nodeId: node.id,
            reason: "node already has an active run",
            activeRunId: activeRun.id,
          });
          continue;
        }
      }

      launched.push(startNodeRun(runManager, workflow.name, node, extra));
    }

    return reply.code(201).send({
      workflowId: workflow.id,
      launched,
      skipped,
      startedAt: new Date().toISOString(),
    });
  });
}
