import type { FastifyRequest, FastifyReply } from "fastify";
import type { AuthUser } from "./types.js";

export const USER_ROLES = ["admin", "operator", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 3,
  operator: 2,
  viewer: 1,
};

export function hasRole(user: AuthUser, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[requiredRole];
}

export type AuthenticateFunction = (req: FastifyRequest) => Promise<AuthUser | null>;

export function createAuthHook(authenticate: AuthenticateFunction) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await authenticate(req);
    if (!user) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    (req as FastifyRequest & { user: AuthUser }).user = user;
  };
}

export function createRoleGuard(requiredRole: UserRole) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as FastifyRequest & { user?: AuthUser }).user;
    if (!user) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    if (!hasRole(user, requiredRole)) {
      reply.code(403).send({ error: "Forbidden: insufficient role" });
      return;
    }
  };
}
