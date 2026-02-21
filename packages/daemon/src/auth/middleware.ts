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

function resolveForwardedForHeader(
  headers: IncomingHttpHeaders,
): string | undefined {
  const value = headers["x-forwarded-for"];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveForwardedClientIp(
  headers: IncomingHttpHeaders,
): string | undefined {
  const forwarded = resolveForwardedForHeader(headers);
  if (!forwarded) return undefined;
  const first = forwarded
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
  return first || undefined;
}

function normalizeIp(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isLoopbackAddress(value: string | undefined): boolean {
  const normalized = normalizeIp(value);
  if (!normalized) return false;
  if (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "localhost"
  ) {
    return true;
  }
  if (normalized.startsWith("::ffff:")) {
    return isLoopbackAddress(normalized.slice("::ffff:".length));
  }
  return false;
}

function isLocalRequest(
  headers: IncomingHttpHeaders,
  remoteAddress?: string,
): boolean {
  const forwardedIp = resolveForwardedClientIp(headers);
  if (forwardedIp && !isLoopbackAddress(forwardedIp)) return false;
  return isLoopbackAddress(remoteAddress);
}

export function authorizeGatewayHeaders(
  headers: IncomingHttpHeaders,
  token?: string,
  remoteAddress?: string,
): GatewayIdentity | null {
  if (!token) {
    if (remoteAddress === undefined) return LOCAL_IDENTITY;
    return isLocalRequest(headers, remoteAddress) ? LOCAL_IDENTITY : null;
  }
  const bearer = extractBearerToken(resolveAuthorizationHeader(headers));
  if (bearer === token) {
    return { id: "token", method: "token" };
  }
  return null;
}

export function createGatewayAuthHook(token?: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const remoteAddress =
      (typeof req.ip === "string" && req.ip.trim().length > 0
        ? req.ip
        : req.raw.socket.remoteAddress) ?? undefined;
    const identity = authorizeGatewayHeaders(req.headers, token, remoteAddress);
    if (identity) {
      (req as FastifyRequest & { identity: GatewayIdentity }).identity = identity;
      return;
    }
    if (!token) {
      reply.code(401).send({
        error:
          "Unauthorized: loopback-only access when UNDOABLE_TOKEN is not configured.",
      });
      return;
    }
    reply.code(401).send({ error: "Unauthorized" });
  };
}
