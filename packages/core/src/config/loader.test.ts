import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig, getConfigValue, setConfigValue } from "./loader.js";
import { DEFAULT_CONFIG } from "./schema.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "undoable-config-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.UNDOABLE_DAEMON_PORT;
  delete process.env.UNDOABLE_DAEMON_HOST;
  delete process.env.UNDOABLE_JWT_SECRET;
  delete process.env.UNDOABLE_DATABASE_URL;
  delete process.env.UNDOABLE_LOG_LEVEL;
});

describe("loadConfig", () => {
  it("returns defaults when no config files exist", () => {
    const result = loadConfig(tmpDir);
    expect(result.config.daemon.port).toBe(7433);
    expect(result.sources).toContain("default");
    expect(result.errors).toHaveLength(0);
  });

  it("loads project config override", () => {
    const configDir = path.join(tmpDir, ".undoable");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.yaml"), JSON.stringify({ daemon: { port: 9000 } }));

    const result = loadConfig(tmpDir);
    expect(result.config.daemon.port).toBe(9000);
    expect(result.sources).toContain("project");
  });

  it("applies env overrides", () => {
    process.env.UNDOABLE_DAEMON_PORT = "8888";
    process.env.UNDOABLE_LOG_LEVEL = "debug";

    const result = loadConfig(tmpDir);
    expect(result.config.daemon.port).toBe(8888);
    expect(result.config.logging.level).toBe("debug");
  });

  it("reports validation errors for invalid project config", () => {
    const configDir = path.join(tmpDir, ".undoable");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.yaml"), JSON.stringify({ daemon: { port: -1 } }));

    const result = loadConfig(tmpDir);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("[project]");
  });
});

describe("getConfigValue", () => {
  it("gets nested value by dot path", () => {
    expect(getConfigValue(DEFAULT_CONFIG, "daemon.port")).toBe(7433);
  });

  it("gets deep nested value", () => {
    expect(getConfigValue(DEFAULT_CONFIG, "logging.level")).toBe("info");
  });

  it("returns undefined for missing key", () => {
    expect(getConfigValue(DEFAULT_CONFIG, "daemon.nope")).toBeUndefined();
  });

  it("returns undefined for deeply missing key", () => {
    expect(getConfigValue(DEFAULT_CONFIG, "a.b.c.d")).toBeUndefined();
  });
});

describe("setConfigValue", () => {
  it("sets nested value by dot path", () => {
    const updated = setConfigValue(DEFAULT_CONFIG, "daemon.port", 9999);
    expect(updated.daemon.port).toBe(9999);
  });

  it("does not mutate original", () => {
    const before = DEFAULT_CONFIG.daemon.port;
    setConfigValue(DEFAULT_CONFIG, "daemon.port", 1111);
    expect(DEFAULT_CONFIG.daemon.port).toBe(before);
  });

  it("creates intermediate objects", () => {
    const updated = setConfigValue(DEFAULT_CONFIG, "custom.nested.key", "value");
    expect(getConfigValue(updated, "custom.nested.key")).toBe("value");
  });
});
