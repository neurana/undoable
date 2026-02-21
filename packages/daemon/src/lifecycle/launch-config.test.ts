import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDaemonLaunchConfig } from "./launch-config.js";

const ORIGINAL_ENV = {
  NRN_PORT: process.env.NRN_PORT,
  NRN_HOST: process.env.NRN_HOST,
  UNDOABLE_DAEMON_PORT: process.env.UNDOABLE_DAEMON_PORT,
  UNDOABLE_DAEMON_HOST: process.env.UNDOABLE_DAEMON_HOST,
  UNDOABLE_TOKEN: process.env.UNDOABLE_TOKEN,
  UNDOABLE_SECURITY_POLICY: process.env.UNDOABLE_SECURITY_POLICY,
  UNDOABLE_DAEMON_SETTINGS_FILE: process.env.UNDOABLE_DAEMON_SETTINGS_FILE,
};

afterEach(() => {
  process.env.NRN_PORT = ORIGINAL_ENV.NRN_PORT;
  process.env.NRN_HOST = ORIGINAL_ENV.NRN_HOST;
  process.env.UNDOABLE_DAEMON_PORT = ORIGINAL_ENV.UNDOABLE_DAEMON_PORT;
  process.env.UNDOABLE_DAEMON_HOST = ORIGINAL_ENV.UNDOABLE_DAEMON_HOST;
  process.env.UNDOABLE_TOKEN = ORIGINAL_ENV.UNDOABLE_TOKEN;
  process.env.UNDOABLE_SECURITY_POLICY = ORIGINAL_ENV.UNDOABLE_SECURITY_POLICY;
  process.env.UNDOABLE_DAEMON_SETTINGS_FILE =
    ORIGINAL_ENV.UNDOABLE_DAEMON_SETTINGS_FILE;
});

async function withTempSettingsFile(
  payload: Record<string, unknown>,
): Promise<{ dir: string; file: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-launch-config-"));
  const file = path.join(dir, "daemon-settings.json");
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  return { dir, file };
}

describe("resolveDaemonLaunchConfig", () => {
  it("uses stored daemon settings when env overrides are missing", async () => {
    const { dir, file } = await withTempSettingsFile({
      host: "10.0.0.5",
      port: 9123,
      authMode: "token",
      token: "stored-token",
      securityPolicy: "strict",
    });

    try {
      const env: NodeJS.ProcessEnv = {
        UNDOABLE_DAEMON_SETTINGS_FILE: file,
      };
      const resolved = resolveDaemonLaunchConfig(env);

      expect(resolved.port).toBe(9123);
      expect(resolved.host).toBe("10.0.0.5");
      expect(resolved.token).toBe("stored-token");
      expect(resolved.securityPolicy).toBe("strict");
      expect(env.UNDOABLE_TOKEN).toBe("stored-token");
      expect(env.NRN_HOST).toBe("10.0.0.5");
      expect(env.NRN_PORT).toBe("9123");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("prefers explicit env values over stored settings", async () => {
    const { dir, file } = await withTempSettingsFile({
      host: "10.0.0.5",
      port: 9123,
      authMode: "token",
      token: "stored-token",
      securityPolicy: "strict",
    });

    try {
      const env: NodeJS.ProcessEnv = {
        UNDOABLE_DAEMON_SETTINGS_FILE: file,
        NRN_HOST: "127.0.0.1",
        NRN_PORT: "7433",
        UNDOABLE_TOKEN: "env-token",
        UNDOABLE_SECURITY_POLICY: "balanced",
      };
      const resolved = resolveDaemonLaunchConfig(env);

      expect(resolved.port).toBe(7433);
      expect(resolved.host).toBe("127.0.0.1");
      expect(resolved.token).toBe("env-token");
      expect(resolved.securityPolicy).toBe("balanced");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("ignores stored token when authMode is open", async () => {
    const { dir, file } = await withTempSettingsFile({
      host: "127.0.0.1",
      port: 7000,
      authMode: "open",
      token: "should-not-be-used",
    });

    try {
      const env: NodeJS.ProcessEnv = {
        UNDOABLE_DAEMON_SETTINGS_FILE: file,
      };
      const resolved = resolveDaemonLaunchConfig(env);

      expect(resolved.token).toBe("");
      expect(env.UNDOABLE_TOKEN).toBeUndefined();
      expect(resolved.securityPolicy).toBe("balanced");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("falls back to defaults when the settings file is invalid", () => {
    const env: NodeJS.ProcessEnv = {
      UNDOABLE_DAEMON_SETTINGS_FILE: "/tmp/non-existent-undoable-settings.json",
    };
    const resolved = resolveDaemonLaunchConfig(env);

    expect(resolved.port).toBe(7433);
    expect(resolved.host).toBeUndefined();
    expect(resolved.token).toBe("");
    expect(resolved.securityPolicy).toBe("balanced");
  });
});
