import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "@undoable/core";
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
  });

  describe("count", () => {
    it("tracks run count", () => {
      expect(manager.count()).toBe(0);
      manager.create({ userId: "u1", agentId: "default", instruction: "test" });
      expect(manager.count()).toBe(1);
    });
  });
});
