import { describe, it, expect } from "vitest";
import { NodeGatewayService } from "./node-gateway-service.js";

describe("NodeGatewayService", () => {
  it("handles pairing request/approve/verify", () => {
    const service = new NodeGatewayService();

    const requested = service.requestPairing({ nodeId: "node-1", displayName: "Phone" });
    expect(requested.status).toBe("pending");
    expect(requested.created).toBe(true);

    const approved = service.approvePairing(requested.request.requestId);
    expect(approved).not.toBeNull();
    if (!approved) return;

    const verified = service.verifyToken(approved.node.nodeId, approved.node.token);
    expect(verified.ok).toBe(true);
  });

  it("supports token rotate/revoke", () => {
    const service = new NodeGatewayService();
    const requested = service.requestPairing({ nodeId: "node-2" });
    const approved = service.approvePairing(requested.request.requestId);
    expect(approved).not.toBeNull();
    if (!approved) return;

    const rotated = service.rotateToken("node-2");
    expect(rotated).not.toBeNull();
    if (!rotated) return;

    const revoked = service.revokeToken("node-2");
    expect(revoked?.revoked).toBe(true);

    const verifyAfterRevoke = service.verifyToken("node-2", rotated.token);
    expect(verifyAfterRevoke.ok).toBe(false);
  });

  it("stores invoke results", () => {
    const service = new NodeGatewayService();
    service.recordInvokeResult({ id: "inv-1", nodeId: "node-x", ok: true, payload: { ok: 1 } });
    const result = service.getInvokeResult("inv-1") as { ok?: boolean; payload?: unknown };
    expect(result.ok).toBe(true);
    expect(result.payload).toEqual({ ok: 1 });
  });
});
