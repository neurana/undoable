import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, validateConfig, mergeConfig } from "./schema.js";

describe("DEFAULT_CONFIG", () => {
  it("has all required sections", () => {
    expect(DEFAULT_CONFIG.daemon).toBeDefined();
    expect(DEFAULT_CONFIG.database).toBeDefined();
    expect(DEFAULT_CONFIG.sandbox).toBeDefined();
    expect(DEFAULT_CONFIG.llm).toBeDefined();
    expect(DEFAULT_CONFIG.logging).toBeDefined();
    expect(DEFAULT_CONFIG.agents).toBeDefined();
  });

  it("has sensible defaults", () => {
    expect(DEFAULT_CONFIG.daemon.port).toBe(7433);
    expect(DEFAULT_CONFIG.sandbox.defaultNetwork).toBe("none");
    expect(DEFAULT_CONFIG.logging.level).toBe("info");
  });
});

describe("validateConfig", () => {
  it("accepts empty object", () => {
    expect(validateConfig({}).valid).toBe(true);
  });

  it("accepts valid config", () => {
    const result = validateConfig({
      daemon: { port: 8080, host: "0.0.0.0" },
      sandbox: { memoryMb: 1024, cpus: 2, defaultNetwork: "restricted" },
      logging: { level: "debug", format: "json" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid port", () => {
    const result = validateConfig({ daemon: { port: -1 } });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("port");
  });

  it("rejects port > 65535", () => {
    const result = validateConfig({ daemon: { port: 99999 } });
    expect(result.valid).toBe(false);
  });

  it("rejects non-string host", () => {
    const result = validateConfig({ daemon: { host: 123 } });
    expect(result.valid).toBe(false);
  });

  it("rejects low memoryMb", () => {
    const result = validateConfig({ sandbox: { memoryMb: 10 } });
    expect(result.valid).toBe(false);
  });

  it("rejects low cpus", () => {
    const result = validateConfig({ sandbox: { cpus: 0.1 } });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid network mode", () => {
    const result = validateConfig({ sandbox: { defaultNetwork: "yolo" } });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid log level", () => {
    const result = validateConfig({ logging: { level: "verbose" } });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid log format", () => {
    const result = validateConfig({ logging: { format: "xml" } });
    expect(result.valid).toBe(false);
  });
});

describe("mergeConfig", () => {
  it("overrides daemon settings", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { daemon: { port: 9000 } });
    expect(merged.daemon.port).toBe(9000);
    expect(merged.daemon.host).toBe("127.0.0.1");
  });

  it("overrides sandbox settings", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { sandbox: { memoryMb: 2048 } });
    expect(merged.sandbox.memoryMb).toBe(2048);
    expect(merged.sandbox.cpus).toBe(1);
  });

  it("merges llm providers", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      llm: { defaultProvider: "openai", providers: { openai: { model: "gpt-4o" } } },
    });
    expect(merged.llm.defaultProvider).toBe("openai");
    expect(merged.llm.providers.openai).toEqual({ model: "gpt-4o" });
  });

  it("merges agents", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      agents: { reviewer: { model: "claude-4" } },
    });
    expect(merged.agents.reviewer).toEqual({ model: "claude-4" });
    expect(merged.agents.default).toBeDefined();
  });

  it("does not mutate base config", () => {
    const before = DEFAULT_CONFIG.daemon.port;
    mergeConfig(DEFAULT_CONFIG, { daemon: { port: 9999 } });
    expect(DEFAULT_CONFIG.daemon.port).toBe(before);
  });
});
