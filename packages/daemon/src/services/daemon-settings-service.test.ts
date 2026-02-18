import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DaemonSettingsService } from "./daemon-settings-service.js";

const ORIGINAL_ENV = {
  NRN_HOST: process.env.NRN_HOST,
  NRN_PORT: process.env.NRN_PORT,
  UNDOABLE_TOKEN: process.env.UNDOABLE_TOKEN,
  UNDOABLE_SECURITY_POLICY: process.env.UNDOABLE_SECURITY_POLICY,
};
const tempDirs: string[] = [];

function restoreEnv() {
  process.env.NRN_HOST = ORIGINAL_ENV.NRN_HOST;
  process.env.NRN_PORT = ORIGINAL_ENV.NRN_PORT;
  process.env.UNDOABLE_TOKEN = ORIGINAL_ENV.UNDOABLE_TOKEN;
  process.env.UNDOABLE_SECURITY_POLICY = ORIGINAL_ENV.UNDOABLE_SECURITY_POLICY;
}

async function createTempSettingsFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-daemon-settings-"));
  tempDirs.push(dir);
  return path.join(dir, "daemon-settings.json");
}

afterEach(async () => {
  restoreEnv();
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("DaemonSettingsService", () => {
  it("updates bind/auth/security profile and persists desired state", async () => {
    const settingsFile = await createTempSettingsFile();
    const service = new DaemonSettingsService(settingsFile);

    const snapshot = await service.update({
      bindMode: "all",
      port: 8111,
      authMode: "token",
      token: "test-token",
      securityPolicy: "permissive",
    });

    expect(snapshot.desired.bindMode).toBe("all");
    expect(snapshot.desired.host).toBe("0.0.0.0");
    expect(snapshot.desired.port).toBe(8111);
    expect(snapshot.desired.authMode).toBe("token");
    expect(snapshot.desired.token).toBe("test-token");
    expect(snapshot.desired.securityPolicy).toBe("permissive");
  });

  it("keeps explicit bind mode precedence when host is also provided", async () => {
    const settingsFile = await createTempSettingsFile();
    const service = new DaemonSettingsService(settingsFile);

    const snapshot = await service.update({
      bindMode: "loopback",
      host: "10.0.0.8",
    });

    expect(snapshot.desired.bindMode).toBe("loopback");
    expect(snapshot.desired.host).toBe("127.0.0.1");
  });

  it("rotates token and forces token auth mode", async () => {
    const settingsFile = await createTempSettingsFile();
    const service = new DaemonSettingsService(settingsFile);

    const snapshot = await service.update({
      authMode: "open",
      rotateToken: true,
    });

    expect(snapshot.desired.authMode).toBe("token");
    expect(snapshot.desired.token.length).toBeGreaterThan(0);
  });
});
