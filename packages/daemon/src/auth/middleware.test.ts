import { describe, it, expect } from "vitest";
import { hasRole, USER_ROLES } from "./middleware.js";
import type { AuthUser } from "./types.js";

function user(role: AuthUser["role"]): AuthUser {
  return { id: "u1", username: "test", role };
}

describe("middleware", () => {
  describe("USER_ROLES", () => {
    it("contains admin, operator, viewer", () => {
      expect(USER_ROLES).toEqual(["admin", "operator", "viewer"]);
    });
  });

  describe("hasRole", () => {
    it("admin has all roles", () => {
      expect(hasRole(user("admin"), "admin")).toBe(true);
      expect(hasRole(user("admin"), "operator")).toBe(true);
      expect(hasRole(user("admin"), "viewer")).toBe(true);
    });

    it("operator has operator and viewer", () => {
      expect(hasRole(user("operator"), "admin")).toBe(false);
      expect(hasRole(user("operator"), "operator")).toBe(true);
      expect(hasRole(user("operator"), "viewer")).toBe(true);
    });

    it("viewer has only viewer", () => {
      expect(hasRole(user("viewer"), "admin")).toBe(false);
      expect(hasRole(user("viewer"), "operator")).toBe(false);
      expect(hasRole(user("viewer"), "viewer")).toBe(true);
    });
  });
});
