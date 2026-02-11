import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { envString, envInt, envBool } from "./env.js";

describe("envString", () => {
  beforeEach(() => {
    process.env.TEST_STR = "hello";
    process.env.TEST_STR_SPACES = "  world  ";
  });

  afterEach(() => {
    delete process.env.TEST_STR;
    delete process.env.TEST_STR_SPACES;
  });

  it("returns env value", () => {
    expect(envString("TEST_STR")).toBe("hello");
  });

  it("trims whitespace", () => {
    expect(envString("TEST_STR_SPACES")).toBe("world");
  });

  it("returns fallback when missing", () => {
    expect(envString("NONEXISTENT", "default")).toBe("default");
  });

  it("returns empty string as default fallback", () => {
    expect(envString("NONEXISTENT")).toBe("");
  });
});

describe("envInt", () => {
  beforeEach(() => {
    process.env.TEST_INT = "42";
    process.env.TEST_INT_BAD = "notanumber";
    process.env.TEST_INT_SPACES = "  99  ";
  });

  afterEach(() => {
    delete process.env.TEST_INT;
    delete process.env.TEST_INT_BAD;
    delete process.env.TEST_INT_SPACES;
  });

  it("parses integer value", () => {
    expect(envInt("TEST_INT", 0)).toBe(42);
  });

  it("trims and parses", () => {
    expect(envInt("TEST_INT_SPACES", 0)).toBe(99);
  });

  it("returns fallback for non-numeric", () => {
    expect(envInt("TEST_INT_BAD", 10)).toBe(10);
  });

  it("returns fallback when missing", () => {
    expect(envInt("NONEXISTENT", 7)).toBe(7);
  });
});

describe("envBool", () => {
  afterEach(() => {
    delete process.env.TEST_BOOL;
  });

  it.each(["1", "true", "yes", "TRUE", "Yes"])("returns true for '%s'", (val) => {
    process.env.TEST_BOOL = val;
    expect(envBool("TEST_BOOL")).toBe(true);
  });

  it.each(["0", "false", "no", "other"])("returns false for '%s'", (val) => {
    process.env.TEST_BOOL = val;
    expect(envBool("TEST_BOOL")).toBe(false);
  });

  it("returns fallback when missing", () => {
    expect(envBool("NONEXISTENT", true)).toBe(true);
    expect(envBool("NONEXISTENT", false)).toBe(false);
  });

  it("defaults to false", () => {
    expect(envBool("NONEXISTENT")).toBe(false);
  });
});
