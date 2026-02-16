import { describe, it, expect, vi } from "vitest";
import { authorizeGatewayHeaders, createGatewayAuthHook } from "./middleware.js";

function mockReq(authorization?: string) {
  return { headers: { authorization } } as unknown as import("fastify").FastifyRequest;
}

function mockReply() {
  const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
  return reply as unknown as import("fastify").FastifyReply & { code: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
}

describe("createGatewayAuthHook", () => {
  it("allows all requests when no token configured (local dev)", async () => {
    const hook = createGatewayAuthHook();
    const req = mockReq();
    const reply = mockReply();
    await hook(req, reply);
    expect((req as unknown as Record<string, unknown>).identity).toEqual({ id: "local", method: "local" });
    expect(reply.code).not.toHaveBeenCalled();
  });

  it("allows requests with valid Bearer token", async () => {
    const hook = createGatewayAuthHook("secret-token");
    const req = mockReq("Bearer secret-token");
    const reply = mockReply();
    await hook(req, reply);
    expect((req as unknown as Record<string, unknown>).identity).toEqual({ id: "token", method: "token" });
  });

  it("rejects requests with wrong token", async () => {
    const hook = createGatewayAuthHook("secret-token");
    const req = mockReq("Bearer wrong-token");
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it("rejects requests with no auth header when token required", async () => {
    const hook = createGatewayAuthHook("secret-token");
    const req = mockReq();
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.code).toHaveBeenCalledWith(401);
  });
});

describe("authorizeGatewayHeaders", () => {
  it("returns local identity when token is not configured", () => {
    const identity = authorizeGatewayHeaders({}, undefined);
    expect(identity).toEqual({ id: "local", method: "local" });
  });

  it("returns token identity when bearer token matches", () => {
    const identity = authorizeGatewayHeaders({ authorization: "Bearer secret-token" }, "secret-token");
    expect(identity).toEqual({ id: "token", method: "token" });
  });

  it("returns null when bearer token does not match", () => {
    const identity = authorizeGatewayHeaders({ authorization: "Bearer wrong-token" }, "secret-token");
    expect(identity).toBeNull();
  });
});
