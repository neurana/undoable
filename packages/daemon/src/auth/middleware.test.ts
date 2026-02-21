import { describe, it, expect, vi } from "vitest";
import { authorizeGatewayHeaders, createGatewayAuthHook } from "./middleware.js";

function mockReq(params?: {
  authorization?: string;
  ip?: string;
  forwardedFor?: string;
}) {
  const ip = params?.ip ?? "127.0.0.1";
  const forwarded = params?.forwardedFor;
  const headers: Record<string, string | undefined> = {
    authorization: params?.authorization,
  };
  if (forwarded) headers["x-forwarded-for"] = forwarded;
  return {
    ip,
    headers,
    raw: { socket: { remoteAddress: ip } },
  } as unknown as import("fastify").FastifyRequest;
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

  it("rejects remote requests when no token configured", async () => {
    const hook = createGatewayAuthHook();
    const req = mockReq({ ip: "54.10.10.10" });
    const reply = mockReply();
    await hook(req, reply);
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("loopback-only"),
      }),
    );
  });

  it("allows requests with valid Bearer token", async () => {
    const hook = createGatewayAuthHook("secret-token");
    const req = mockReq({ authorization: "Bearer secret-token" });
    const reply = mockReply();
    await hook(req, reply);
    expect((req as unknown as Record<string, unknown>).identity).toEqual({ id: "token", method: "token" });
  });

  it("rejects requests with wrong token", async () => {
    const hook = createGatewayAuthHook("secret-token");
    const req = mockReq({ authorization: "Bearer wrong-token" });
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
    const identity = authorizeGatewayHeaders({}, undefined, "127.0.0.1");
    expect(identity).toEqual({ id: "local", method: "local" });
  });

  it("returns null for remote addresses when token is not configured", () => {
    const identity = authorizeGatewayHeaders({}, undefined, "3.9.9.9");
    expect(identity).toBeNull();
  });

  it("returns null when forwarded-for points to non-loopback", () => {
    const identity = authorizeGatewayHeaders(
      { "x-forwarded-for": "8.8.8.8" },
      undefined,
      "127.0.0.1",
    );
    expect(identity).toBeNull();
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
