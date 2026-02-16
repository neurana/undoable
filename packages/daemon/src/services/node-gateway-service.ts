import { randomBytes, randomUUID } from "node:crypto";
import type { ConnectorConfig } from "../connectors/types.js";

export type NodePairRequest = {
  requestId: string;
  nodeId: string;
  displayName?: string;
  platform?: string;
  caps?: string[];
  commands?: string[];
  connector?: ConnectorConfig;
  createdAtMs: number;
};

export type PairedNode = {
  nodeId: string;
  displayName?: string;
  platform?: string;
  caps: string[];
  commands: string[];
  token: string;
  pairedAtMs: number;
};

export type NodeEventRecord = {
  nodeId: string;
  event: string;
  payload?: unknown;
  ts: number;
};

const MAX_NODE_EVENTS = 200;

export class NodeGatewayService {
  private requests = new Map<string, NodePairRequest>();
  private paired = new Map<string, PairedNode>();
  private invokeResults = new Map<string, unknown>();
  private nodeEvents: NodeEventRecord[] = [];

  requestPairing(input: {
    nodeId: string;
    displayName?: string;
    platform?: string;
    caps?: string[];
    commands?: string[];
    connector?: ConnectorConfig;
  }): { status: "pending"; created: boolean; request: NodePairRequest } {
    const nodeId = input.nodeId.trim();

    for (const existing of this.requests.values()) {
      if (existing.nodeId === nodeId) {
        return { status: "pending", created: false, request: existing };
      }
    }

    const request: NodePairRequest = {
      requestId: randomUUID(),
      nodeId,
      displayName: input.displayName,
      platform: input.platform,
      caps: [...new Set(input.caps ?? [])],
      commands: [...new Set(input.commands ?? [])],
      connector: input.connector,
      createdAtMs: Date.now(),
    };

    this.requests.set(request.requestId, request);
    return { status: "pending", created: true, request };
  }

  listPairing(): { requests: NodePairRequest[]; paired: PairedNode[] } {
    return {
      requests: [...this.requests.values()],
      paired: [...this.paired.values()],
    };
  }

  approvePairing(requestId: string): { requestId: string; node: PairedNode; connector?: ConnectorConfig } | null {
    const request = this.requests.get(requestId);
    if (!request) return null;

    this.requests.delete(requestId);
    const node: PairedNode = {
      nodeId: request.nodeId,
      displayName: request.displayName,
      platform: request.platform,
      caps: request.caps ?? [],
      commands: request.commands ?? [],
      token: randomBytes(16).toString("hex"),
      pairedAtMs: Date.now(),
    };

    this.paired.set(node.nodeId, node);
    return { requestId, node, connector: request.connector };
  }

  rejectPairing(requestId: string): { requestId: string; nodeId: string } | null {
    const request = this.requests.get(requestId);
    if (!request) return null;
    this.requests.delete(requestId);
    return { requestId, nodeId: request.nodeId };
  }

  verifyToken(nodeId: string, token: string): { ok: boolean; nodeId: string } {
    const paired = this.paired.get(nodeId);
    if (!paired) return { ok: false, nodeId };
    return { ok: paired.token === token, nodeId };
  }

  renameNode(nodeId: string, displayName: string): { nodeId: string; displayName: string } | null {
    const paired = this.paired.get(nodeId);
    if (!paired) return null;
    paired.displayName = displayName;
    return { nodeId: paired.nodeId, displayName };
  }

  rotateToken(nodeId: string): { nodeId: string; token: string } | null {
    const paired = this.paired.get(nodeId);
    if (!paired) return null;
    paired.token = randomBytes(16).toString("hex");
    return { nodeId, token: paired.token };
  }

  revokeToken(nodeId: string): { nodeId: string; revoked: boolean } | null {
    const paired = this.paired.get(nodeId);
    if (!paired) return null;
    paired.token = "";
    return { nodeId, revoked: true };
  }

  getPaired(nodeId: string): PairedNode | null {
    return this.paired.get(nodeId) ?? null;
  }

  getInvokeResult(id: string): unknown {
    return this.invokeResults.get(id);
  }

  recordInvokeResult(input: {
    id: string;
    nodeId: string;
    ok: boolean;
    payload?: unknown;
    error?: unknown;
  }): void {
    this.invokeResults.set(input.id, {
      nodeId: input.nodeId,
      ok: input.ok,
      payload: input.payload,
      error: input.error,
      ts: Date.now(),
    });
  }

  recordNodeEvent(event: NodeEventRecord): void {
    this.nodeEvents.push(event);
    if (this.nodeEvents.length > MAX_NODE_EVENTS) {
      this.nodeEvents = this.nodeEvents.slice(this.nodeEvents.length - MAX_NODE_EVENTS);
    }
  }
}
