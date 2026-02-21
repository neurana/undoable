import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { healthRoutes } from "./health.js";

describe("health routes", () => {
  it("GET /health returns status ok", async () => {
    const app = Fastify();
    await app.register(healthRoutes);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/health" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.ready).toBe(true);
    expect(body.version).toBe("0.1.0");
    expect(typeof body.uptime).toBe("number");
    await app.close();
  });

  it("GET /ready returns ready true", async () => {
    const app = Fastify();
    await app.register(healthRoutes);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/ready" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.ready).toBe(true);
    await app.close();
  });

  it("GET /ready returns 503 when dependencies are not ready", async () => {
    const app = Fastify();
    await app.register(healthRoutes, {
      getSnapshot: async () => ({
        ready: false,
        checks: {
          database: {
            enabled: true,
            initialized: false,
            error: "connect failed",
          },
        },
      }),
    });
    await app.ready();

    const ready = await app.inject({ method: "GET", url: "/ready" });
    const readyBody = ready.json();
    expect(ready.statusCode).toBe(503);
    expect(readyBody.ready).toBe(false);
    expect(readyBody.checks.database.initialized).toBe(false);

    const health = await app.inject({ method: "GET", url: "/health" });
    const healthBody = health.json();
    expect(health.statusCode).toBe(200);
    expect(healthBody.status).toBe("degraded");
    expect(healthBody.ready).toBe(false);
    await app.close();
  });
});
