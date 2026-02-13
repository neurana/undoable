import type { FastifyInstance } from "fastify";
import { checkPermissions } from "../services/permissions.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    status: "ok",
    version: "0.1.0",
    uptime: process.uptime(),
  }));

  app.get("/ready", async () => ({
    ready: true,
  }));

  app.get("/permissions", async () => checkPermissions());
}
