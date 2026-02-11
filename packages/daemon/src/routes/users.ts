import type { FastifyInstance } from "fastify";
import type { UserService } from "../services/user-service.js";
import type { AuditService } from "../services/audit-service.js";
import type { AuthUser } from "../auth/types.js";
import type { UserRole } from "../auth/middleware.js";

type AuthRequest = { user: AuthUser };

export function userRoutes(
  app: FastifyInstance,
  userService: UserService,
  auditService: AuditService,
) {
  app.post<{ Body: { username: string; role?: UserRole } }>("/users", async (req, reply) => {
    const { user } = req as unknown as AuthRequest;

    if (user.role !== "admin") {
      return reply.code(403).send({ error: "Forbidden: admin only" });
    }

    const { username, role } = req.body;
    if (!username) {
      return reply.code(400).send({ error: "username is required" });
    }

    try {
      const result = userService.create({ username, role });
      auditService.log({
        userId: user.id,
        action: "user.create",
        resourceType: "user",
        resourceId: result.user.id,
        metadata: { username, role: result.user.role },
      });
      return reply.code(201).send({
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
        apiKey: result.apiKey,
      });
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.get("/users", async (req, reply) => {
    const { user } = req as unknown as AuthRequest;

    if (user.role !== "admin") {
      return reply.code(403).send({ error: "Forbidden: admin only" });
    }

    return userService.list().map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
    }));
  });

  app.delete<{ Params: { id: string } }>("/users/:id", async (req, reply) => {
    const { user } = req as unknown as AuthRequest;

    if (user.role !== "admin") {
      return reply.code(403).send({ error: "Forbidden: admin only" });
    }

    const deleted = userService.delete(req.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: "User not found" });
    }

    auditService.log({
      userId: user.id,
      action: "user.delete",
      resourceType: "user",
      resourceId: req.params.id,
    });

    return { deleted: true };
  });
}
