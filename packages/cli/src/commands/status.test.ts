import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDaemonStatus } from "./status.js";

function createPaths(root: string) {
  return {
    home: root,
    pidFile: path.join(root, "daemon.pid.json"),
    daemonSettingsFile: path.join(root, "daemon-settings.json"),
    providersFile: path.join(root, "providers.json"),
  };
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

describe("resolveDaemonStatus", () => {
  const tempRoots: string[] = [];

  function createTempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "undoable-status-"));
    tempRoots.push(root);
    return root;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const root of tempRoots.splice(0, tempRoots.length)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports running and ready when /health is successful", async () => {
    const root = createTempRoot();
    const paths = createPaths(root);
    writeJson(paths.pidFile, { port: 7433 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ready: true, checks: { scheduler: { started: true } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ) as typeof fetch,
    );

    const status = await resolveDaemonStatus(paths);
    expect(status.state).toBe("running");
    expect(status.ready).toBe(true);
    expect(status.statusCode).toBe(200);
    expect(status.checks).toEqual({ scheduler: { started: true } });
  });

  it("reports running with authRequired when daemon responds 401", async () => {
    const root = createTempRoot();
    const paths = createPaths(root);
    writeJson(paths.pidFile, { port: 7433 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ) as typeof fetch,
    );

    const status = await resolveDaemonStatus(paths);
    expect(status.state).toBe("running");
    expect(status.authRequired).toBe(true);
    expect(status.statusCode).toBe(401);
  });

  it("reports stopped when health is unreachable and no daemon pid is alive", async () => {
    const root = createTempRoot();
    const paths = createPaths(root);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")) as typeof fetch,
    );

    const status = await resolveDaemonStatus(paths);
    expect(status.state).toBe("stopped");
    expect(status.detail).toMatch(/ECONNREFUSED/);
  });

  it("reports degraded when daemon pid is alive but health probe fails", async () => {
    const root = createTempRoot();
    const paths = createPaths(root);
    writeJson(paths.pidFile, { port: 7433, pid: process.pid });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ETIMEDOUT")) as typeof fetch,
    );

    const status = await resolveDaemonStatus(paths);
    expect(status.state).toBe("degraded");
    expect(status.detail).toMatch(/alive but \/health is unreachable/i);
  });

  it("sends bearer token from daemon settings when authMode=token", async () => {
    const root = createTempRoot();
    const paths = createPaths(root);
    writeJson(paths.pidFile, { port: 7433 });
    writeJson(paths.daemonSettingsFile, { authMode: "token", token: "secret-token" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ready: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    await resolveDaemonStatus(paths);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:7433/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
        }),
      }),
    );
  });
});
