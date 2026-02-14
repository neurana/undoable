import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { EventBus } from "@undoable/core";
import { RunManager } from "../services/run-manager.js";
import { eventRoutes } from "./events.js";

describe("event routes", () => {
  const eventBus = new EventBus();
  const runManager = new RunManager(eventBus);
  const app = Fastify();

  eventBus.onAll((event) => {
    runManager.appendEvent(event.runId, event);
  });

  beforeAll(async () => {
    eventRoutes(app, eventBus, runManager);
    await app.ready();
  });

  afterAll(async () => {
    eventBus.removeAllListeners();
    await app.close();
  });

  it("returns 404 for unknown run", async () => {
    const res = await app.inject({ method: "GET", url: "/runs/unknown/events" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Run not found");
  });

  it("stores events for replay via eventBus.onAll wiring", () => {
    const run = runManager.create({ userId: "u1", agentId: "default", instruction: "test" });
    eventBus.emit(run.id, "STATUS_CHANGED", { status: "planning" }, "system");
    eventBus.emit(run.id, "TOOL_CALL", { name: "exec", args: {} }, "system");

    const stored = runManager.getEvents(run.id);
    expect(stored.length).toBeGreaterThanOrEqual(3);

    const types = stored.map((e) => e.type);
    expect(types[0]).toBe("RUN_CREATED");
    expect(types).toContain("STATUS_CHANGED");
    expect(types).toContain("TOOL_CALL");
  });

  it("provides events for completed runs", () => {
    const run = runManager.create({ userId: "u1", agentId: "default", instruction: "completed" });
    eventBus.emit(run.id, "STATUS_CHANGED", { status: "planning" }, "system");
    eventBus.emit(run.id, "RUN_COMPLETED", { content: "done" }, "system");
    runManager.updateStatus(run.id, "completed", "system");

    const stored = runManager.getEvents(run.id);
    const types = stored.map((e) => e.type);
    expect(types).toContain("RUN_CREATED");
    expect(types).toContain("RUN_COMPLETED");
    expect(types).toContain("STATUS_CHANGED");
  });

  it("isolates events between different runs", () => {
    const run1 = runManager.create({ userId: "u1", agentId: "default", instruction: "a" });
    const run2 = runManager.create({ userId: "u1", agentId: "default", instruction: "b" });
    eventBus.emit(run1.id, "TOOL_CALL", { name: "exec" }, "system");

    const events1 = runManager.getEvents(run1.id);
    const events2 = runManager.getEvents(run2.id);
    expect(events1.some((e) => e.type === "TOOL_CALL")).toBe(true);
    expect(events2.some((e) => e.type === "TOOL_CALL")).toBe(false);
  });
});
