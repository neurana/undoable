import type { FastifyRequest, FastifyReply } from "fastify";
import type { GatewayIdentity } from "./types.js";
import { extractBearerToken } from "./api-key.js";

const LOCAL_IDENTITY: GatewayIdentity = { id: "local", method: "local" };

export function createGatewayAuthHook(token?: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!token) {
      (req as FastifyRequest & { identity: GatewayIdentity }).identity = LOCAL_IDENTITY;
      return;
    }
    const bearer = extractBearerToken(req.headers.authorization);
    if (bearer === token) {
      (req as FastifyRequest & { identity: GatewayIdentity }).identity = { id: "token", method: "token" };
      return;
    }
    reply.code(401).send({ error: "Unauthorized" });
  };
}
