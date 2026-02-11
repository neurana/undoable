import { describe, it, expect } from "vitest";
import { Logger, createLogger } from "./logger.js";
import type { LogEntry } from "./logger.js";

describe("Logger", () => {
  it("logs at or above configured level", () => {
    const entries: LogEntry[] = [];
    const logger = new Logger("test", "info", (e) => entries.push(e));

    logger.debug("skip");
    logger.info("keep");
    logger.warn("keep");
    logger.error("keep");

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.level)).toEqual(["info", "warn", "error"]);
  });

  it("suppresses all logs at silent level", () => {
    const entries: LogEntry[] = [];
    const logger = new Logger("test", "silent", (e) => entries.push(e));

    logger.debug("x");
    logger.info("x");
    logger.warn("x");
    logger.error("x");

    expect(entries).toHaveLength(0);
  });

  it("includes subsystem in entries", () => {
    const entries: LogEntry[] = [];
    const logger = new Logger("engine", "debug", (e) => entries.push(e));
    logger.info("started");
    expect(entries[0]!.subsystem).toBe("engine");
  });

  it("includes data in entries", () => {
    const entries: LogEntry[] = [];
    const logger = new Logger("test", "debug", (e) => entries.push(e));
    logger.info("msg", { runId: "r1" });
    expect(entries[0]!.data).toEqual({ runId: "r1" });
  });

  it("includes ISO timestamp", () => {
    const entries: LogEntry[] = [];
    const logger = new Logger("test", "debug", (e) => entries.push(e));
    logger.info("msg");
    expect(new Date(entries[0]!.ts).getTime()).toBeGreaterThan(0);
  });

  describe("child", () => {
    it("creates child logger with prefixed subsystem", () => {
      const entries: LogEntry[] = [];
      const parent = new Logger("engine", "debug", (e) => entries.push(e));
      const child = parent.child("shadow");
      child.info("running");
      expect(entries[0]!.subsystem).toBe("engine:shadow");
    });
  });

  describe("setLevel", () => {
    it("changes log level dynamically", () => {
      const entries: LogEntry[] = [];
      const logger = new Logger("test", "error", (e) => entries.push(e));
      logger.info("skip");
      expect(entries).toHaveLength(0);

      logger.setLevel("debug");
      logger.info("now visible");
      expect(entries).toHaveLength(1);
    });
  });
});

describe("createLogger", () => {
  it("creates logger with defaults", () => {
    const logger = createLogger("test");
    expect(logger).toBeInstanceOf(Logger);
  });

  it("creates logger with custom level", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger("test", "warn", (e) => entries.push(e));
    logger.info("skip");
    logger.warn("keep");
    expect(entries).toHaveLength(1);
  });
});
