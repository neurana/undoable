import { generateId, nowISO, type RunStatus } from "@undoable/shared";
import type { EventBus } from "@undoable/core";
import type { RunManager } from "../run-manager.js";
import type { SwarmWorkflow, SwarmWorkflowNode } from "./types.js";

const ACTIVE_RUN_STATUSES = new Set<RunStatus>([
  "created",
  "planning",
  "planned",
  "shadowing",
  "shadowed",
  "approval_required",
  "applying",
  "undoing",
]);

const TERMINAL_RUN_STATUSES = new Set<RunStatus>([
  "completed",
  "failed",
  "cancelled",
]);

const DEFAULT_MAX_PARALLEL = 4;
const MAX_PARALLEL_CAP = 64;

export type SwarmWorkflowRunInput = {
  nodeIds?: string[];
  includeDisabled?: boolean;
  allowConcurrent?: boolean;
  maxParallel?: number;
  failFast?: boolean;
  respectDependencies?: boolean;
};

export type SwarmNodeLaunchResult = {
  nodeId: string;
  runId: string;
  jobId: string;
  agentId: string;
};

export type SwarmNodeSkipResult = {
  nodeId: string;
  reason: string;
  activeRunId?: string;
};

export type SwarmOrchestrationNodeStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped"
  | "blocked";

export type SwarmOrchestrationNodeState = {
  nodeId: string;
  status: SwarmOrchestrationNodeStatus;
  dependsOn: string[];
  runId?: string;
  jobId?: string;
  agentId?: string;
  reason?: string;
  startedAt?: string;
  completedAt?: string;
};

export type SwarmOrchestrationStatus = "running" | "completed" | "failed";

export type SwarmOrchestrationRecord = {
  id: string;
  workflowId: string;
  workflowVersion: number;
  workflowName: string;
  status: SwarmOrchestrationStatus;
  options: Required<SwarmWorkflowRunInput>;
  launched: SwarmNodeLaunchResult[];
  skipped: SwarmNodeSkipResult[];
  nodes: SwarmOrchestrationNodeState[];
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  completedAt?: string;
};

type InternalNodeState = SwarmOrchestrationNodeState & {
  node: SwarmWorkflowNode;
};

type InternalRecord = {
  id: string;
  workflowId: string;
  workflowVersion: number;
  workflowName: string;
  status: SwarmOrchestrationStatus;
  options: Required<SwarmWorkflowRunInput>;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  completedAt?: string;
  launched: SwarmNodeLaunchResult[];
  skipped: SwarmNodeSkipResult[];
  nodes: Map<string, InternalNodeState>;
  dependencies: Map<string, Set<string>>;
  children: Map<string, Set<string>>;
  readyQueue: string[];
  runToNode: Map<string, string>;
  unsubscribers: Map<string, () => void>;
};

type StartNodeRun = (
  workflow: Pick<SwarmWorkflow, "name">,
  node: Pick<SwarmWorkflowNode, "id" | "name" | "prompt" | "jobId" | "agentId">,
) => SwarmNodeLaunchResult;

export type SwarmOrchestratorOptions = {
  runManager: RunManager;
  eventBus?: EventBus;
  startNodeRun: StartNodeRun;
  maxParallelDefault?: number;
  maxHistory?: number;
};

function normalizeNodeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function normalizeRunInput(
  input: SwarmWorkflowRunInput | undefined,
  maxParallelDefault: number,
): Required<SwarmWorkflowRunInput> {
  const maxParallelRaw = input?.maxParallel;
  const maxParallel =
    typeof maxParallelRaw === "number" && Number.isFinite(maxParallelRaw)
      ? Math.max(1, Math.min(MAX_PARALLEL_CAP, Math.floor(maxParallelRaw)))
      : maxParallelDefault;

  return {
    nodeIds: normalizeNodeIds(input?.nodeIds),
    includeDisabled: input?.includeDisabled === true,
    allowConcurrent: input?.allowConcurrent === true,
    maxParallel,
    failFast: input?.failFast !== false,
    respectDependencies: input?.respectDependencies !== false,
  };
}

function cloneNodeState(state: SwarmOrchestrationNodeState): SwarmOrchestrationNodeState {
  return {
    nodeId: state.nodeId,
    status: state.status,
    dependsOn: [...state.dependsOn],
    runId: state.runId,
    jobId: state.jobId,
    agentId: state.agentId,
    reason: state.reason,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
  };
}

function isTerminalNodeStatus(status: SwarmOrchestrationNodeStatus): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "skipped" ||
    status === "blocked"
  );
}

function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

function toNodeTerminalStatus(status: RunStatus): SwarmOrchestrationNodeStatus {
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "failed";
}

function parseStatusFromPayload(payload: unknown): RunStatus | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const status = (payload as { status?: unknown }).status;
  if (typeof status !== "string") return null;
  return status as RunStatus;
}

function now(): string {
  return nowISO();
}

function sanitizeReason(reason: string): string {
  const trimmed = reason.trim();
  return trimmed || "blocked";
}

export class SwarmOrchestrator {
  private readonly runManager: RunManager;
  private readonly eventBus?: EventBus;
  private readonly startNodeRun: StartNodeRun;
  private readonly maxParallelDefault: number;
  private readonly maxHistory: number;
  private readonly records = new Map<string, InternalRecord>();

  constructor(opts: SwarmOrchestratorOptions) {
    this.runManager = opts.runManager;
    this.eventBus = opts.eventBus;
    this.startNodeRun = opts.startNodeRun;

    const envDefault = Number(process.env.UNDOABLE_SWARM_MAX_PARALLEL ?? "");
    const sourceDefault =
      Number.isFinite(envDefault) && envDefault > 0
        ? Math.floor(envDefault)
        : opts.maxParallelDefault ?? DEFAULT_MAX_PARALLEL;
    this.maxParallelDefault = Math.max(1, Math.min(MAX_PARALLEL_CAP, sourceDefault));

    const envMaxHistory = Number(process.env.UNDOABLE_SWARM_ORCHESTRATION_HISTORY ?? "");
    this.maxHistory = Number.isFinite(envMaxHistory) && envMaxHistory > 0
      ? Math.max(10, Math.floor(envMaxHistory))
      : opts.maxHistory ?? 200;
  }

  listByWorkflow(workflowId: string): SwarmOrchestrationRecord[] {
    const out: SwarmOrchestrationRecord[] = [];
    for (const record of this.records.values()) {
      if (record.workflowId !== workflowId) continue;
      out.push(this.toPublic(record));
    }
    out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return out;
  }

  get(id: string): SwarmOrchestrationRecord | undefined {
    const record = this.records.get(id);
    return record ? this.toPublic(record) : undefined;
  }

  start(workflow: SwarmWorkflow, input?: SwarmWorkflowRunInput): SwarmOrchestrationRecord {
    const options = normalizeRunInput(input, this.maxParallelDefault);
    const startedAt = now();
    const record: InternalRecord = {
      id: generateId(),
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      workflowName: workflow.name,
      status: "running",
      options,
      createdAt: startedAt,
      updatedAt: startedAt,
      startedAt,
      launched: [],
      skipped: [],
      nodes: new Map(),
      dependencies: new Map(),
      children: new Map(),
      readyQueue: [],
      runToNode: new Map(),
      unsubscribers: new Map(),
    };

    this.seedNodes(record, workflow);
    this.seedDependencies(record, workflow);

    this.records.set(record.id, record);
    this.dispatch(record, workflow);
    this.finalizeIfTerminal(record);
    this.trimHistory();

    return this.toPublic(record);
  }

  private seedNodes(record: InternalRecord, workflow: SwarmWorkflow): void {
    const requestedIds = record.options.nodeIds;
    const requestSet = new Set(requestedIds);
    const nodeById = new Map(workflow.nodes.map((node) => [node.id, node] as const));

    if (requestedIds.length > 0) {
      for (const nodeId of requestedIds) {
        if (!nodeById.has(nodeId)) {
          record.skipped.push({ nodeId, reason: "node not found" });
        }
      }
    }

    for (const node of workflow.nodes) {
      if (requestedIds.length > 0 && !requestSet.has(node.id)) continue;
      if (!record.options.includeDisabled && !node.enabled) {
        record.skipped.push({ nodeId: node.id, reason: "node is disabled" });
        continue;
      }

      record.nodes.set(node.id, {
        nodeId: node.id,
        node,
        status: "pending",
        dependsOn: [],
      });
      record.dependencies.set(node.id, new Set());
      record.children.set(node.id, new Set());
    }
  }

  private seedDependencies(record: InternalRecord, workflow: SwarmWorkflow): void {
    if (!record.options.respectDependencies) {
      for (const nodeId of record.nodes.keys()) {
        record.readyQueue.push(nodeId);
      }
      return;
    }

    for (const edge of workflow.edges) {
      if (!record.nodes.has(edge.from) || !record.nodes.has(edge.to)) continue;
      record.dependencies.get(edge.to)?.add(edge.from);
      record.children.get(edge.from)?.add(edge.to);
    }

    for (const [nodeId, deps] of record.dependencies.entries()) {
      const node = record.nodes.get(nodeId);
      if (!node) continue;
      node.dependsOn = [...deps];
      if (deps.size === 0) {
        record.readyQueue.push(nodeId);
      }
    }
  }

  private dispatch(record: InternalRecord, workflow: SwarmWorkflow): void {
    if (record.status !== "running") return;

    while (
      record.readyQueue.length > 0 &&
      this.countRunningNodes(record) < record.options.maxParallel
    ) {
      const nodeId = record.readyQueue.shift();
      if (!nodeId) break;

      const state = record.nodes.get(nodeId);
      if (!state || state.status !== "pending") continue;

      if (!record.options.allowConcurrent) {
        const active = this.findActiveRunForNode(state.node);
        if (active) {
          this.markNodeSkipped(
            record,
            state,
            "node already has an active run",
            active.id,
            workflow,
          );
          continue;
        }
      }

      const launched = this.startNodeRun(workflow, state.node);
      state.status = "running";
      state.runId = launched.runId;
      state.jobId = launched.jobId;
      state.agentId = launched.agentId;
      state.startedAt = now();

      record.launched.push(launched);
      record.runToNode.set(launched.runId, state.nodeId);
      this.attachRunWatcher(record, launched.runId, workflow);
      record.updatedAt = now();
    }
  }

  private markNodeSkipped(
    record: InternalRecord,
    state: InternalNodeState,
    reason: string,
    activeRunId: string | undefined,
    workflow: SwarmWorkflow,
  ): void {
    state.status = "skipped";
    state.reason = sanitizeReason(reason);
    state.completedAt = now();
    record.skipped.push({
      nodeId: state.nodeId,
      reason: state.reason,
      activeRunId,
    });

    this.resolveDownstream(record, state.nodeId, false, workflow);
    record.updatedAt = now();
  }

  private attachRunWatcher(record: InternalRecord, runId: string, workflow: SwarmWorkflow): void {
    if (!this.eventBus) return;

    const unsubscribe = this.eventBus.onRun(runId, (event) => {
      if (event.type !== "STATUS_CHANGED") return;
      const status = parseStatusFromPayload(event.payload);
      if (!status || !isTerminalRunStatus(status)) return;
      this.completeNodeRun(record, runId, status, workflow);
    });

    record.unsubscribers.set(runId, unsubscribe);
  }

  private completeNodeRun(
    record: InternalRecord,
    runId: string,
    status: RunStatus,
    workflow: SwarmWorkflow,
  ): void {
    const nodeId = record.runToNode.get(runId);
    if (!nodeId) return;

    const state = record.nodes.get(nodeId);
    if (!state || state.status !== "running") return;

    const unsubscribe = record.unsubscribers.get(runId);
    if (unsubscribe) {
      unsubscribe();
      record.unsubscribers.delete(runId);
    }

    const nodeStatus = toNodeTerminalStatus(status);
    state.status = nodeStatus;
    state.completedAt = now();
    if (nodeStatus !== "completed") {
      state.reason = `run ${status}`;
    }

    record.runToNode.delete(runId);
    record.updatedAt = now();

    this.resolveDownstream(record, nodeId, nodeStatus === "completed", workflow);

    if (!record.options.failFast || nodeStatus === "completed") {
      this.dispatch(record, workflow);
    } else {
      this.blockRemainingPending(record, `dependency ${nodeId} ${nodeStatus}`);
    }

    this.finalizeIfTerminal(record);
  }

  private resolveDownstream(
    record: InternalRecord,
    fromNodeId: string,
    fromSucceeded: boolean,
    workflow: SwarmWorkflow,
  ): void {
    const children = record.children.get(fromNodeId);
    if (!children || children.size === 0) return;

    for (const childId of children) {
      const childState = record.nodes.get(childId);
      if (!childState || childState.status !== "pending") continue;

      const deps = record.dependencies.get(childId);
      if (!deps || deps.size === 0) {
        record.readyQueue.push(childId);
        continue;
      }

      let allDone = true;
      let hasFailure = false;
      let failingDep = "";

      for (const depId of deps) {
        const depState = record.nodes.get(depId);
        if (!depState) continue;
        if (depState.status === "pending" || depState.status === "running") {
          allDone = false;
          break;
        }
        if (depState.status !== "completed") {
          hasFailure = true;
          failingDep = depId;
        }
      }

      if (!allDone) continue;

      if (hasFailure || !fromSucceeded) {
        childState.status = "blocked";
        childState.reason = sanitizeReason(
          failingDep
            ? `dependency ${failingDep} did not complete successfully`
            : `dependency ${fromNodeId} did not complete successfully`,
        );
        childState.completedAt = now();
        if (record.options.failFast) {
          this.blockRemainingPending(record, childState.reason);
          break;
        }
        this.resolveDownstream(record, childId, false, workflow);
        continue;
      }

      record.readyQueue.push(childId);
    }
  }

  private blockRemainingPending(record: InternalRecord, reason: string): void {
    for (const state of record.nodes.values()) {
      if (state.status !== "pending") continue;
      state.status = "blocked";
      state.reason = sanitizeReason(reason);
      state.completedAt = now();
    }
    record.readyQueue = [];
    record.updatedAt = now();
  }

  private finalizeIfTerminal(record: InternalRecord): void {
    if (record.status !== "running") return;

    if (record.readyQueue.length > 0) return;
    if (this.countRunningNodes(record) > 0) return;

    let hasFailed = false;
    for (const state of record.nodes.values()) {
      if (!isTerminalNodeStatus(state.status)) {
        return;
      }
      if (state.status === "failed" || state.status === "cancelled") {
        hasFailed = true;
      }
    }

    record.status = hasFailed ? "failed" : "completed";
    record.completedAt = now();
    record.updatedAt = record.completedAt;

    for (const unsubscribe of record.unsubscribers.values()) {
      unsubscribe();
    }
    record.unsubscribers.clear();
  }

  private countRunningNodes(record: InternalRecord): number {
    let count = 0;
    for (const state of record.nodes.values()) {
      if (state.status === "running") count++;
    }
    return count;
  }

  private findActiveRunForNode(node: Pick<SwarmWorkflowNode, "id" | "jobId">) {
    const jobId = node.jobId ?? `swarm-node-${node.id}`;
    return this.runManager
      .listByJobId(jobId)
      .find((run) => ACTIVE_RUN_STATUSES.has(run.status));
  }

  private toPublic(record: InternalRecord): SwarmOrchestrationRecord {
    return {
      id: record.id,
      workflowId: record.workflowId,
      workflowVersion: record.workflowVersion,
      workflowName: record.workflowName,
      status: record.status,
      options: {
        nodeIds: [...record.options.nodeIds],
        includeDisabled: record.options.includeDisabled,
        allowConcurrent: record.options.allowConcurrent,
        maxParallel: record.options.maxParallel,
        failFast: record.options.failFast,
        respectDependencies: record.options.respectDependencies,
      },
      launched: record.launched.map((entry) => ({ ...entry })),
      skipped: record.skipped.map((entry) => ({ ...entry })),
      nodes: [...record.nodes.values()].map((state) =>
        cloneNodeState({
          nodeId: state.nodeId,
          status: state.status,
          dependsOn: state.dependsOn,
          runId: state.runId,
          jobId: state.jobId,
          agentId: state.agentId,
          reason: state.reason,
          startedAt: state.startedAt,
          completedAt: state.completedAt,
        }),
      ),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
    };
  }

  private trimHistory(): void {
    if (this.records.size <= this.maxHistory) return;

    const completed = [...this.records.values()]
      .filter((record) => record.status !== "running")
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

    let toDelete = this.records.size - this.maxHistory;
    for (const record of completed) {
      if (toDelete <= 0) break;
      this.records.delete(record.id);
      toDelete--;
    }
  }
}
