import Fastify from "fastify";
import { EventBus } from "@undoable/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunManager } from "../services/run-manager.js";
import { AuditService } from "../services/audit-service.js";
import { runRoutes } from "./runs.js";
import type { DaemonOperationalState } from "../services/daemon-settings-service.js";

describe("run routes operation mode guard", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    app.addHook("onRequest", async (req) => {
      (req as unknown as { identity: { id: string; method: "local" } }).identity =
        {
          id: "test-user",
          method: "local",
        };
    });
  });

  afterEach(async () => {
    await app.close();
  });

  function registerWithMode(mode: DaemonOperationalState["mode"]) {
    const eventBus = new EventBus();
    const runManager = new RunManager(eventBus, { persistence: "off" });
    const audit = new AuditService();
    runRoutes(app, runManager, audit, {
      eventBus,
      getOperationalState: () => ({
        mode,
        reason: mode === "normal" ? "" : "maintenance",
        updatedAt: new Date().toISOString(),
      }),
    });
  }

  it("creates runs in normal mode", async () => {
    registerWithMode("normal");
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/runs",
      payload: { instruction: "hello world" },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("created");
  });

  it("blocks new runs in paused mode", async () => {
    registerWithMode("paused");
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/runs",
      payload: { instruction: "hello world" },
    });

    expect(res.statusCode).toBe(423);
    const body = res.json();
    expect(body.code).toBe("DAEMON_OPERATION_MODE_BLOCK");
    expect(body.operation.mode).toBe("paused");
  });
});
