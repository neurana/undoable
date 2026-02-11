import { describe, it, expect, beforeEach } from "vitest";
import { ShadowExecutor } from "./shadow-executor.js";
import type { ToolAdapter, ToolExecuteParams, ToolResult } from "../tools/types.js";
import type { PlanStep } from "@undoable/shared";

function makeAdapter(id: string, handler: (p: ToolExecuteParams) => Promise<ToolResult>): ToolAdapter {
  return {
    id,
    description: `mock ${id}`,
    requiredCapabilityPrefix: id,
    execute: handler,
    validate: () => true,
    estimateCapabilities: () => [],
  };
}

function makeStep(overrides: Partial<PlanStep> = {}): PlanStep {
  return {
    id: "s1",
    tool: "shell",
    intent: "run command",
    params: { command: "echo", args: ["hi"] },
    capabilities: ["shell.exec:*"],
    reversible: true,
    dependsOn: [],
    ...overrides,
  };
}

let adapters: Map<string, ToolAdapter>;

beforeEach(() => {
  adapters = new Map();
  adapters.set("shell", makeAdapter("shell", async () => ({
    success: true,
    output: "hi",
  })));
  adapters.set("fs", makeAdapter("fs", async () => ({
    success: true,
    output: "written",
  })));
});

describe("ShadowExecutor", () => {
  describe("executeStep", () => {
    it("executes a step with matching adapter", async () => {
      const executor = new ShadowExecutor(
        { backend: "local", workspacePath: "/tmp", runId: "r1" },
        adapters,
      );
      const result = await executor.executeStep(makeStep());
      expect(result.success).toBe(true);
      expect(result.output).toBe("hi");
      expect(result.tool).toBe("shell");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("returns error for missing adapter", async () => {
      const executor = new ShadowExecutor(
        { backend: "local", workspacePath: "/tmp", runId: "r1" },
        adapters,
      );
      const result = await executor.executeStep(makeStep({ tool: "unknown" }));
      expect(result.success).toBe(false);
      expect(result.error).toContain("No adapter");
    });

    it("catches adapter exceptions", async () => {
      adapters.set("fail", makeAdapter("fail", async () => {
        throw new Error("boom");
      }));
      const executor = new ShadowExecutor(
        { backend: "local", workspacePath: "/tmp", runId: "r1" },
        adapters,
      );
      const result = await executor.executeStep(makeStep({ tool: "fail" }));
      expect(result.success).toBe(false);
      expect(result.error).toContain("boom");
    });
  });

  describe("executePlan", () => {
    it("executes all steps in order", async () => {
      const executor = new ShadowExecutor(
        { backend: "local", workspacePath: "/tmp", runId: "r1" },
        adapters,
      );
      const steps = [
        makeStep({ id: "s1", tool: "shell" }),
        makeStep({ id: "s2", tool: "fs", dependsOn: ["s1"] }),
      ];
      const results = await executor.executePlan(steps);
      expect(results).toHaveLength(2);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(true);
    });

    it("skips step when dependency failed", async () => {
      adapters.set("shell", makeAdapter("shell", async () => ({
        success: false,
        output: "",
        error: "command failed",
      })));
      const executor = new ShadowExecutor(
        { backend: "local", workspacePath: "/tmp", runId: "r1" },
        adapters,
      );
      const steps = [
        makeStep({ id: "s1", tool: "shell" }),
        makeStep({ id: "s2", tool: "fs", dependsOn: ["s1"] }),
      ];
      const results = await executor.executePlan(steps);
      expect(results).toHaveLength(2);
      expect(results[0]!.success).toBe(false);
      expect(results[1]!.success).toBe(false);
      expect(results[1]!.error).toContain("dependency");
    });

    it("executes independent steps even if one fails", async () => {
      adapters.set("shell", makeAdapter("shell", async () => ({
        success: false,
        output: "",
        error: "fail",
      })));
      const executor = new ShadowExecutor(
        { backend: "local", workspacePath: "/tmp", runId: "r1" },
        adapters,
      );
      const steps = [
        makeStep({ id: "s1", tool: "shell" }),
        makeStep({ id: "s2", tool: "fs", dependsOn: [] }),
      ];
      const results = await executor.executePlan(steps);
      expect(results[0]!.success).toBe(false);
      expect(results[1]!.success).toBe(true);
    });
  });

  describe("getResults + reset", () => {
    it("tracks and resets results", async () => {
      const executor = new ShadowExecutor(
        { backend: "local", workspacePath: "/tmp", runId: "r1" },
        adapters,
      );
      await executor.executeStep(makeStep());
      expect(executor.getResults()).toHaveLength(1);
      executor.reset();
      expect(executor.getResults()).toHaveLength(0);
    });
  });
});
