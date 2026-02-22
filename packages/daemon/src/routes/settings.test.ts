import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { settingsRoutes } from "./settings.js";
import { DaemonSettingsService } from "../services/daemon-settings-service.js";

let app: ReturnType<typeof Fastify>;
const tempDirs: string[] = [];

async function createTempSettingsFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-settings-route-"));
  tempDirs.push(dir);
  return path.join(dir, "daemon-settings.json");
}

beforeEach(async () => {
  const settingsFile = await createTempSettingsFile();
  const service = new DaemonSettingsService(settingsFile);
  app = Fastify();
  settingsRoutes(app, service);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("settings routes", () => {
  it("returns daemon snapshot", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/settings/daemon",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("desired");
    expect(body).toHaveProperty("effective");
    expect(body).toHaveProperty("restartRequired");
    expect(body.desired.token).toBe("");
  });

  it("applies daemon settings patch", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/settings/daemon",
      payload: {
        bindMode: "all",
        port: 9001,
        authMode: "token",
        token: "abc123",
        securityPolicy: "strict",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.desired.bindMode).toBe("all");
    expect(body.desired.host).toBe("0.0.0.0");
    expect(body.desired.port).toBe(9001);
    expect(body.desired.authMode).toBe("token");
    expect(body.desired.securityPolicy).toBe("strict");
    expect(body.desired.token).toBe("");
    expect(body.effective.tokenSet).toBe(false);
    expect(body.restartRequired).toBe(true);
  });

  it("rejects invalid daemon settings patch", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/settings/daemon",
      payload: { port: 70000 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/port/i);
  });

  it("gets and sets operation mode via control routes", async () => {
    const before = await app.inject({
      method: "GET",
      url: "/control/operation",
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().mode).toBe("normal");

    const updated = await app.inject({
      method: "PATCH",
      url: "/control/operation",
      payload: { mode: "drain", reason: "deploy in progress" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().mode).toBe("drain");
    expect(updated.json().reason).toBe("deploy in progress");
  });

  it("rejects invalid control operation payload", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/control/operation",
      payload: { reason: "missing mode" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/mode/i);
  });
});
