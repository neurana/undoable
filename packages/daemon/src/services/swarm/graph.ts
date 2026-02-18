import type { SwarmEdge, SwarmWorkflow, SwarmWorkflowNode } from "./types.js";
import { cleanOptionalString } from "./utils.js";

export function assertNodeIdAvailable(workflow: SwarmWorkflow, nodeId: string): void {
  if (workflow.nodes.some((node) => node.id === nodeId)) {
    throw new Error(`node "${nodeId}" already exists in workflow`);
  }
}

export function normalizeEdge(workflow: SwarmWorkflow, edge: SwarmEdge): SwarmEdge {
  const from = cleanOptionalString(edge.from);
  const to = cleanOptionalString(edge.to);

  if (!from || !to) {
    throw new Error("edge requires both from and to node IDs");
  }
  if (from === to) {
    throw new Error("edge cannot connect a node to itself");
  }

  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  if (!nodeIds.has(from)) {
    throw new Error(`edge source node "${from}" does not exist in workflow`);
  }
  if (!nodeIds.has(to)) {
    throw new Error(`edge target node "${to}" does not exist in workflow`);
  }

  return {
    from,
    to,
    condition: cleanOptionalString(edge.condition),
  };
}

export function assignEdges(workflow: SwarmWorkflow, edges: SwarmEdge[]): void {
  const deduped = new Map<string, SwarmEdge>();
  for (const edge of edges) {
    const normalized = normalizeEdge(workflow, edge);
    deduped.set(`${normalized.from}->${normalized.to}`, normalized);
  }

  const next = [...deduped.values()];
  assertAcyclic(workflow.nodes, next);
  workflow.edges = next;
}

export function assertAcyclic(nodes: SwarmWorkflowNode[], edges: SwarmEdge[]): void {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }

  const visitState = new Map<string, 0 | 1 | 2>();

  const visit = (nodeId: string): void => {
    const state = visitState.get(nodeId) ?? 0;
    if (state === 1) {
      throw new Error("workflow edges must form a DAG (cycle detected)");
    }
    if (state === 2) return;

    visitState.set(nodeId, 1);
    const next = adjacency.get(nodeId) ?? [];
    for (const target of next) {
      visit(target);
    }
    visitState.set(nodeId, 2);
  };

  for (const node of nodes) {
    if ((visitState.get(node.id) ?? 0) === 0) {
      visit(node.id);
    }
  }
}
