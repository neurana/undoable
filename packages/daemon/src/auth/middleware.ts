import type { FastifyRequest, FastifyReply } from "fastify";
import type { IncomingHttpHeaders } from "node:http";
import type { GatewayIdentity } from "./types.js";
import { extractBearerToken } from "./api-key.js";

const LOCAL_IDENTITY: GatewayIdentity = { id: "local", method: "local" };

function resolveAuthorizationHeader(headers: IncomingHttpHeaders): string | undefined {
  const value = headers.authorization;
  if (Array.isArray(value)) return value[0];
  return value;
}

export function authorizeGatewayHeaders(headers: IncomingHttpHeaders, token?: string): GatewayIdentity | null {
  if (!token) return LOCAL_IDENTITY;
  const bearer = extractBearerToken(resolveAuthorizationHeader(headers));
  if (bearer === token) {
    return { id: "token", method: "token" };
  }
  return null;
}

export function createGatewayAuthHook(token?: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const identity = authorizeGatewayHeaders(req.headers, token);
    if (identity) {
      (req as FastifyRequest & { identity: GatewayIdentity }).identity = identity;
      return;
    }
    reply.code(401).send({ error: "Unauthorized" });
  };
}
