import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { healthRoutes } from "./health.js";

describe("health routes", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(healthRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns status ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
    expect(typeof body.uptime).toBe("number");
  });

  it("GET /ready returns ready true", async () => {
    const response = await app.inject({ method: "GET", url: "/ready" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.ready).toBe(true);
  });
});
