import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "@undoable/core";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { RunManager } from "./run-manager.js";

let eventBus: EventBus;
let manager: RunManager;

beforeEach(() => {
  eventBus = new EventBus();
  manager = new RunManager(eventBus);
});

describe("RunManager", () => {
  describe("create", () => {
    it("creates a run with correct fields", () => {
      const run = manager.create({
        userId: "u1",
        agentId: "default",
        instruction: "fix bug",
      });
      expect(run.id).toBeTruthy();
      expect(run.userId).toBe("u1");
      expect(run.agentId).toBe("default");
      expect(run.status).toBe("created");
      expect(run.instruction).toBe("fix bug");
      expect(run.engineVersion).toBe("0.1.0");
    });

    it("emits RUN_CREATED event", () => {
      const events: unknown[] = [];
      eventBus.onAll((e) => events.push(e));
      manager.create({ userId: "u1", agentId: "default", instruction: "test" });
      expect(events).toHaveLength(1);
    });
  });

  describe("getById", () => {
    it("returns run by id", () => {
      const run = manager.create({ userId: "u1", agentId: "default", instruction: "test" });
      expect(manager.getById(run.id)?.instruction).toBe("test");
    });

    it("returns undefined for unknown id", () => {
      expect(manager.getById("nope")).toBeUndefined();
    });
  });

  describe("list", () => {
    it("lists all runs", () => {
      manager.create({ userId: "u1", agentId: "default", instruction: "a" });
      manager.create({ userId: "u2", agentId: "default", instruction: "b" });
      expect(manager.list()).toHaveLength(2);
    });

    it("filters by userId", () => {
      manager.create({ userId: "u1", agentId: "default", instruction: "a" });
      manager.create({ userId: "u2", agentId: "default", instruction: "b" });
      expect(manager.list("u1")).toHaveLength(1);
    });
  });

  describe("updateStatus", () => {
    it("updates run status", () => {
      const run = manager.create({ userId: "u1", agentId: "default", instruction: "test" });
      const updated = manager.updateStatus(run.id, "planning");
      expect(updated?.status).toBe("planning");
    });

    it("emits STATUS_CHANGED event", () => {
      const run = manager.create({ userId: "u1", agentId: "default", instruction: "test" });
      const events: unknown[] = [];
      eventBus.onAll((e) => events.push(e));
      manager.updateStatus(run.id, "applying", "u1");
      expect(events).toHaveLength(1);
    });

    it("returns undefined for unknown run", () => {
      expect(manager.updateStatus("nope", "failed")).toBeUndefined();
    });
  });

  describe("setPlan", () => {
    it("sets plan on run", () => {
      const run = manager.create({ userId: "u1", agentId: "default", instruction: "test" });
      const plan = {
        version: 1 as const,
        instruction: "test",
        context: {},
        steps: [],
        estimatedCapabilities: [],
        agentId: "default",
      };
      const updated = manager.setPlan(run.id, plan);
      expect(updated?.plan).toBe(plan);
    });

    it("returns undefined for unknown run", () => {
      expect(manager.setPlan("nope", {} as never)).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("deletes existing run", () => {
      const run = manager.create({ userId: "u1", agentId: "default", instruction: "test" });
      expect(manager.delete(run.id)).toBe(true);
      expect(manager.getById(run.id)).toBeUndefined();
    });

    it("returns false for unknown run", () => {
      expect(manager.delete("nope")).toBe(false);
    });

    it("cleans up event log on delete", () => {
      const run = manager.create({ userId: "u1", agentId: "default", instruction: "test" });
      manager.appendEvent(run.id, {
        eventId: 1, runId: run.id, ts: "2024-01-01T00:00:00Z", type: "STATUS_CHANGED",
      });
      expect(manager.getEvents(run.id)).toHaveLength(1);
      manager.delete(run.id);
      expect(manager.getEvents(run.id)).toHaveLength(0);
    });
  });

  describe("jobId", () => {
    it("stores jobId on run when provided", () => {
      const run = manager.create({
        userId: "scheduler",
        agentId: "default",
        instruction: "backup",
        jobId: "job-123",
      });
      expect(run.jobId).toBe("job-123");
    });

    it("jobId is undefined when not provided", () => {
      const run = manager.create({
        userId: "u1",
        agentId: "default",
        instruction: "test",
      });
      expect(run.jobId).toBeUndefined();
    });
  });

  describe("listByJobId", () => {
    it("returns runs matching the jobId", () => {
      manager.create({ userId: "scheduler", agentId: "default", instruction: "a", jobId: "job-1" });
      manager.create({ userId: "scheduler", agentId: "default", instruction: "b", jobId: "job-1" });
      manager.create({ userId: "scheduler", agentId: "default", instruction: "c", jobId: "job-2" });
      expect(manager.listByJobId("job-1")).toHaveLength(2);
      expect(manager.listByJobId("job-2")).toHaveLength(1);
    });

    it("returns empty array for unknown jobId", () => {
      manager.create({ userId: "u1", agentId: "default", instruction: "test" });
      expect(manager.listByJobId("nonexistent")).toEqual([]);
    });

    it("excludes runs without jobId", () => {
      manager.create({ userId: "u1", agentId: "default", instruction: "manual" });
      manager.create({ userId: "scheduler", agentId: "default", instruction: "auto", jobId: "job-1" });
      expect(manager.listByJobId("job-1")).toHaveLength(1);
    });
  });

  describe("count", () => {
    it("tracks run count", () => {
      expect(manager.count()).toBe(0);
      manager.create({ userId: "u1", agentId: "default", instruction: "test" });
      expect(manager.count()).toBe(1);
    });
  });

  describe("event log", () => {
    it("stores and retrieves events by run id", () => {
      const run = manager.create({ userId: "u1", agentId: "default", instruction: "test" });
      const event = { eventId: 1, runId: run.id, ts: "2024-01-01T00:00:00Z", type: "STATUS_CHANGED" as const };
      manager.appendEvent(run.id, event);
      const events = manager.getEvents(run.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toBe(event);
    });

    it("returns empty array for unknown run", () => {
      expect(manager.getEvents("nonexistent")).toEqual([]);
    });

    it("preserves event order", () => {
      const run = manager.create({ userId: "u1", agentId: "default", instruction: "test" });
      manager.appendEvent(run.id, { eventId: 1, runId: run.id, ts: "t1", type: "RUN_CREATED" as const });
      manager.appendEvent(run.id, { eventId: 2, runId: run.id, ts: "t2", type: "STATUS_CHANGED" as const });
      manager.appendEvent(run.id, { eventId: 3, runId: run.id, ts: "t3", type: "TOOL_CALL" as const });
      const events = manager.getEvents(run.id);
      expect(events).toHaveLength(3);
      expect(events.map((e) => e.eventId)).toEqual([1, 2, 3]);
    });

    it("isolates events between runs", () => {
      const run1 = manager.create({ userId: "u1", agentId: "default", instruction: "a" });
      const run2 = manager.create({ userId: "u1", agentId: "default", instruction: "b" });
      manager.appendEvent(run1.id, { eventId: 1, runId: run1.id, ts: "t1", type: "RUN_CREATED" as const });
      manager.appendEvent(run2.id, { eventId: 2, runId: run2.id, ts: "t2", type: "RUN_CREATED" as const });
      manager.appendEvent(run2.id, { eventId: 3, runId: run2.id, ts: "t3", type: "STATUS_CHANGED" as const });
      expect(manager.getEvents(run1.id)).toHaveLength(1);
      expect(manager.getEvents(run2.id)).toHaveLength(2);
    });

    it("captures events emitted via eventBus.onAll wiring", () => {
      const collected: unknown[] = [];
      eventBus.onAll((event) => {
        manager.appendEvent(event.runId, event);
        collected.push(event);
      });
      const run = manager.create({ userId: "u1", agentId: "default", instruction: "test" });
      // create() emits RUN_CREATED which is captured by onAll
      const events = manager.getEvents(run.id);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0]!.type).toBe("RUN_CREATED");
    });
  });

  describe("persistence", () => {
    it("restores persisted runs and events after restart", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-run-state-"));
      const stateFile = path.join(tmpDir, "runs-state.json");

      try {
        const busA = new EventBus();
        const managerA = new RunManager(busA, { persistence: "on", stateFilePath: stateFile });
        busA.onAll((event) => managerA.appendEvent(event.runId, event));

        const run = managerA.create({ userId: "u1", agentId: "default", instruction: "persist me" });
        managerA.updateStatus(run.id, "completed", "u1");

        await new Promise((resolve) => setTimeout(resolve, 300));

        const busB = new EventBus();
        const managerB = new RunManager(busB, { persistence: "on", stateFilePath: stateFile });
        const restored = managerB.getById(run.id);

        expect(restored).toBeTruthy();
        expect(restored?.status).toBe("completed");
        expect(managerB.getEvents(run.id).length).toBeGreaterThan(0);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("marks in-progress runs as failed during recovery", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-run-recover-"));
      const stateFile = path.join(tmpDir, "runs-state.json");

      try {
        const busA = new EventBus();
        const managerA = new RunManager(busA, { persistence: "on", stateFilePath: stateFile });
        const run = managerA.create({ userId: "u1", agentId: "default", instruction: "resume me" });
        managerA.updateStatus(run.id, "planning", "u1");

        await new Promise((resolve) => setTimeout(resolve, 300));

        const busB = new EventBus();
        const managerB = new RunManager(busB, { persistence: "on", stateFilePath: stateFile });
        const recovered = managerB.getById(run.id);

        expect(recovered?.status).toBe("failed");
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
