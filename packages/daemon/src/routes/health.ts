import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    status: "ok",
    version: "0.1.0",
    uptime: process.uptime(),
  }));

  app.get("/ready", async () => ({
    ready: true,
  }));
}
