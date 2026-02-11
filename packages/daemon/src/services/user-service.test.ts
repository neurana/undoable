import { describe, it, expect, beforeEach } from "vitest";
import { UserService } from "./user-service.js";

let service: UserService;

beforeEach(() => {
  service = new UserService();
});

describe("UserService", () => {
  describe("create", () => {
    it("creates a user with default operator role", () => {
      const { user, apiKey } = service.create({ username: "alice" });
      expect(user.username).toBe("alice");
      expect(user.role).toBe("operator");
      expect(user.id).toBeTruthy();
      expect(apiKey).toMatch(/^nrn_/);
    });

    it("creates a user with custom role", () => {
      const { user } = service.create({ username: "bob", role: "admin" });
      expect(user.role).toBe("admin");
    });

    it("throws on duplicate username", () => {
      service.create({ username: "alice" });
      expect(() => service.create({ username: "alice" })).toThrow("already exists");
    });
  });

  describe("getById", () => {
    it("returns user by id", () => {
      const { user } = service.create({ username: "alice" });
      expect(service.getById(user.id)?.username).toBe("alice");
    });

    it("returns undefined for unknown id", () => {
      expect(service.getById("nope")).toBeUndefined();
    });
  });

  describe("getByUsername", () => {
    it("returns user by username", () => {
      service.create({ username: "alice" });
      expect(service.getByUsername("alice")?.username).toBe("alice");
    });

    it("returns undefined for unknown username", () => {
      expect(service.getByUsername("nope")).toBeUndefined();
    });
  });

  describe("getByApiKeyHash", () => {
    it("finds user by api key hash", () => {
      const { user } = service.create({ username: "alice" });
      const found = service.getByApiKeyHash(user.apiKeyHash);
      expect(found?.id).toBe(user.id);
    });

    it("returns undefined for unknown hash", () => {
      expect(service.getByApiKeyHash("bad-hash")).toBeUndefined();
    });
  });

  describe("list", () => {
    it("returns all users", () => {
      service.create({ username: "a" });
      service.create({ username: "b" });
      expect(service.list()).toHaveLength(2);
    });
  });

  describe("delete", () => {
    it("deletes existing user", () => {
      const { user } = service.create({ username: "alice" });
      expect(service.delete(user.id)).toBe(true);
      expect(service.getById(user.id)).toBeUndefined();
      expect(service.getByUsername("alice")).toBeUndefined();
    });

    it("returns false for unknown user", () => {
      expect(service.delete("nope")).toBe(false);
    });
  });

  describe("count", () => {
    it("tracks user count", () => {
      expect(service.count()).toBe(0);
      service.create({ username: "a" });
      expect(service.count()).toBe(1);
    });
  });
});
