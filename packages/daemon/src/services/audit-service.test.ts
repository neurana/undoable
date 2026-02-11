import { describe, it, expect, beforeEach } from "vitest";
import { AuditService } from "./audit-service.js";

let service: AuditService;

beforeEach(() => {
  service = new AuditService();
});

describe("AuditService", () => {
  describe("log", () => {
    it("creates audit entry with auto-incrementing id", () => {
      const e1 = service.log({ userId: "u1", action: "run.create", resourceType: "run" });
      const e2 = service.log({ userId: "u1", action: "run.delete", resourceType: "run" });
      expect(e1.id).toBe(1);
      expect(e2.id).toBe(2);
    });

    it("sets timestamp", () => {
      const entry = service.log({ userId: "u1", action: "test", resourceType: "test" });
      expect(entry.ts).toBeTruthy();
      expect(new Date(entry.ts).getTime()).toBeGreaterThan(0);
    });

    it("stores optional metadata", () => {
      const entry = service.log({
        userId: "u1",
        action: "test",
        resourceType: "run",
        resourceId: "r1",
        metadata: { foo: "bar" },
      });
      expect(entry.resourceId).toBe("r1");
      expect(entry.metadata).toEqual({ foo: "bar" });
    });

    it("defaults nullable fields to null", () => {
      const entry = service.log({ userId: null, action: "test", resourceType: "test" });
      expect(entry.userId).toBeNull();
      expect(entry.resourceId).toBeNull();
      expect(entry.metadata).toBeNull();
    });
  });

  describe("list", () => {
    it("returns all entries without filter", () => {
      service.log({ userId: "u1", action: "a", resourceType: "run" });
      service.log({ userId: "u2", action: "b", resourceType: "user" });
      expect(service.list()).toHaveLength(2);
    });

    it("filters by userId", () => {
      service.log({ userId: "u1", action: "a", resourceType: "run" });
      service.log({ userId: "u2", action: "b", resourceType: "run" });
      expect(service.list({ userId: "u1" })).toHaveLength(1);
    });

    it("filters by action", () => {
      service.log({ userId: "u1", action: "run.create", resourceType: "run" });
      service.log({ userId: "u1", action: "run.delete", resourceType: "run" });
      expect(service.list({ action: "run.create" })).toHaveLength(1);
    });

    it("filters by resourceType", () => {
      service.log({ userId: "u1", action: "a", resourceType: "run" });
      service.log({ userId: "u1", action: "b", resourceType: "user" });
      expect(service.list({ resourceType: "user" })).toHaveLength(1);
    });
  });

  describe("count + clear", () => {
    it("tracks count and clears", () => {
      service.log({ userId: "u1", action: "a", resourceType: "run" });
      service.log({ userId: "u1", action: "b", resourceType: "run" });
      expect(service.count()).toBe(2);
      service.clear();
      expect(service.count()).toBe(0);
    });
  });
});
