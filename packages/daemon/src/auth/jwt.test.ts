import { describe, it, expect } from "vitest";
import { JwtService } from "./jwt.js";

const SECRET = "test-secret-key-for-jwt-signing-32chars!";
const service = new JwtService(SECRET);

const claims = { sub: "user-1", method: "token" };

describe("JwtService", () => {
  describe("sign + verify", () => {
    it("signs and verifies a token", async () => {
      const token = await service.sign(claims);
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");

      const payload = await service.verify(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("user-1");
      expect(payload!.method).toBe("token");
    });

    it("sets iat and exp", async () => {
      const token = await service.sign(claims);
      const payload = await service.verify(token);
      expect(payload!.iat).toBeGreaterThan(0);
      expect(payload!.exp).toBeGreaterThan(payload!.iat);
    });

    it("respects custom expiry", async () => {
      const token = await service.sign(claims, "1s");
      const payload = await service.verify(token);
      expect(payload!.exp - payload!.iat).toBeLessThanOrEqual(2);
    });
  });

  describe("verify", () => {
    it("returns null for invalid token", async () => {
      const result = await service.verify("invalid.token.here");
      expect(result).toBeNull();
    });

    it("returns null for token signed with different secret", async () => {
      const other = new JwtService("different-secret-key-32-chars!!!");
      const token = await other.sign(claims);
      const result = await service.verify(token);
      expect(result).toBeNull();
    });

    it("returns null for expired token", async () => {
      const token = await service.sign(claims, "0s");
      await new Promise((r) => setTimeout(r, 50));
      const result = await service.verify(token);
      expect(result).toBeNull();
    });
  });
});
