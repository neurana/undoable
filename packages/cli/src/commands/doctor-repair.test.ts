import { describe, expect, it } from "vitest";
import {
  generateDaemonToken,
  inferDaemonBindMode,
  repairDaemonSettingsSecurityProfile,
} from "./doctor-repair.js";

describe("doctor-repair", () => {
  it("infers loopback bind mode for localhost-like hosts", () => {
    expect(inferDaemonBindMode({ host: "127.0.0.1" })).toBe("loopback");
    expect(inferDaemonBindMode({ host: "::1" })).toBe("loopback");
    expect(inferDaemonBindMode({ bindMode: "loopback" })).toBe("loopback");
  });

  it("switches non-loopback open auth to token mode and generates token", () => {
    const repaired = repairDaemonSettingsSecurityProfile({
      bindMode: "all",
      authMode: "open",
    });

    expect(repaired.changed).toBe(true);
    expect(repaired.settings.authMode).toBe("token");
    expect(typeof repaired.settings.token).toBe("string");
    expect((repaired.settings.token as string).length).toBeGreaterThan(20);
  });

  it("generates token when token mode is configured but token is empty", () => {
    const repaired = repairDaemonSettingsSecurityProfile({
      bindMode: "loopback",
      authMode: "token",
      token: "  ",
    });

    expect(repaired.changed).toBe(true);
    expect(repaired.generatedToken).toBeTruthy();
    expect(repaired.notes.some((note) => note.includes("Generated missing daemon token"))).toBe(true);
  });

  it("leaves already secure token configuration unchanged", () => {
    const repaired = repairDaemonSettingsSecurityProfile({
      bindMode: "loopback",
      authMode: "token",
      token: "existing-token",
    });

    expect(repaired.changed).toBe(false);
    expect(repaired.settings.token).toBe("existing-token");
  });

  it("generates URL-safe tokens", () => {
    const token = generateDaemonToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

