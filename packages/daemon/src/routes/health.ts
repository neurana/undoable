import type { FastifyInstance } from "fastify";
import { checkPermissions } from "../services/permissions.js";

export type HealthSnapshot = {
  ready: boolean;
  checks?: Record<string, unknown>;
};

export type HealthRouteOptions = {
  version?: string;
  getSnapshot?: () => Promise<HealthSnapshot> | HealthSnapshot;
};

async function resolveSnapshot(
  opts?: HealthRouteOptions,
): Promise<HealthSnapshot> {
  const raw = await opts?.getSnapshot?.();
  if (!raw) return { ready: true, checks: {} };
  return {
    ready: raw.ready !== false,
    checks: raw.checks ?? {},
  };
}

export async function healthRoutes(
  app: FastifyInstance,
  opts?: HealthRouteOptions,
) {
  const version = opts?.version ?? "0.1.0";

  app.get("/health", async () => {
    const snapshot = await resolveSnapshot(opts);
    return {
      status: snapshot.ready ? "ok" : "degraded",
      ready: snapshot.ready,
      version,
      uptime: process.uptime(),
      checks: snapshot.checks,
    };
  });

  app.get("/ready", async (_req, reply) => {
    const snapshot = await resolveSnapshot(opts);
    const payload = {
      ready: snapshot.ready,
      checks: snapshot.checks,
    };
    if (snapshot.ready) return payload;
    return reply.code(503).send(payload);
  });

  app.get("/permissions", async () => checkPermissions());
}
