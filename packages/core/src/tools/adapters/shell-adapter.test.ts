import { describe, it, expect } from "vitest";
import * as os from "node:os";
import { ShellAdapter } from "./shell-adapter.js";

const adapter = new ShellAdapter();

function exec(params: Record<string, unknown>) {
  return adapter.execute({
    runId: "r1",
    stepId: "s1",
    params,
    workingDir: os.tmpdir(),
    capabilities: [],
  });
}

describe("ShellAdapter", () => {
  it("has correct id and prefix", () => {
    expect(adapter.id).toBe("shell");
    expect(adapter.requiredCapabilityPrefix).toBe("shell.exec");
  });

  it("executes a simple command", async () => {
    const result = await exec({ command: "echo", args: ["hello world"] });
    expect(result.success).toBe(true);
    expect(result.output?.trim()).toBe("hello world");
  });

  it("captures exit code on failure", async () => {
    const result = await exec({ command: "false" });
    expect(result.success).toBe(false);
  });

  it("times out long commands", async () => {
    const result = await exec({ command: "sleep", args: ["10"], timeout: 100 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
  });

  it("returns error for non-existent command", async () => {
    const result = await exec({ command: "nonexistent_cmd_xyz" });
    expect(result.success).toBe(false);
  });

  describe("validate", () => {
    it("returns true for valid params", () => {
      expect(adapter.validate({ command: "echo" })).toBe(true);
    });

    it("returns false for missing command", () => {
      expect(adapter.validate({ args: ["x"] })).toBe(false);
    });
  });

  describe("estimateCapabilities", () => {
    it("returns shell.exec:<command>", () => {
      expect(adapter.estimateCapabilities({ command: "git" })).toEqual(["shell.exec:git"]);
    });
  });
});
