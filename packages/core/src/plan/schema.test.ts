import { describe, it, expect } from "vitest";
import { validatePlanGraph, createPlanGraph } from "./schema.js";
import type { PlanStep } from "@undoable/shared";

const validStep: PlanStep = {
  id: "s1",
  tool: "shell",
  intent: "run a command",
  params: { cmd: "echo hi" },
  capabilities: ["shell.exec:*"],
  reversible: true,
  dependsOn: [],
};

describe("validatePlanGraph", () => {
  it("validates a correct plan", () => {
    const plan = {
      version: 1,
      instruction: "do something",
      context: {},
      steps: [validStep],
      estimatedCapabilities: ["shell.exec:*"],
      agentId: "default",
    };
    const result = validatePlanGraph(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects null", () => {
    const result = validatePlanGraph(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Plan must be an object");
  });

  it("rejects wrong version", () => {
    const result = validatePlanGraph({
      version: 2,
      instruction: "test",
      agentId: "default",
      steps: [validStep],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("version must be 1");
  });

  it("rejects missing instruction", () => {
    const result = validatePlanGraph({
      version: 1,
      agentId: "default",
      steps: [validStep],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("instruction is required");
  });

  it("rejects missing agentId", () => {
    const result = validatePlanGraph({
      version: 1,
      instruction: "test",
      steps: [validStep],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("agentId is required");
  });

  it("rejects empty steps", () => {
    const result = validatePlanGraph({
      version: 1,
      instruction: "test",
      agentId: "default",
      steps: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("at least one step is required");
  });

  it("rejects step without id", () => {
    const result = validatePlanGraph({
      version: 1,
      instruction: "test",
      agentId: "default",
      steps: [{ ...validStep, id: "" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("step[0]: id is required");
  });

  it("rejects step without tool", () => {
    const result = validatePlanGraph({
      version: 1,
      instruction: "test",
      agentId: "default",
      steps: [{ ...validStep, tool: "" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("step[0]: tool is required");
  });

  it("rejects step with non-boolean reversible", () => {
    const result = validatePlanGraph({
      version: 1,
      instruction: "test",
      agentId: "default",
      steps: [{ ...validStep, reversible: "yes" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("step[0]: reversible must be boolean");
  });

  it("rejects duplicate step IDs", () => {
    const result = validatePlanGraph({
      version: 1,
      instruction: "test",
      agentId: "default",
      steps: [validStep, { ...validStep }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('step[1]: duplicate id "s1"');
  });

  it("rejects dependency on non-existent step", () => {
    const result = validatePlanGraph({
      version: 1,
      instruction: "test",
      agentId: "default",
      steps: [{ ...validStep, id: "s1", dependsOn: ["s0"] }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('step[0]: dependency "s0" not found in preceding steps');
  });

  it("accepts valid dependency chain", () => {
    const result = validatePlanGraph({
      version: 1,
      instruction: "test",
      agentId: "default",
      steps: [
        { ...validStep, id: "s1", dependsOn: [] },
        { ...validStep, id: "s2", dependsOn: ["s1"] },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("collects multiple errors", () => {
    const result = validatePlanGraph({
      version: 2,
      instruction: "",
      agentId: "",
      steps: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("createPlanGraph", () => {
  it("creates a valid plan graph", () => {
    const plan = createPlanGraph({
      instruction: "do something",
      agentId: "default",
      steps: [validStep],
    });

    expect(plan.version).toBe(1);
    expect(plan.instruction).toBe("do something");
    expect(plan.agentId).toBe("default");
    expect(plan.steps).toHaveLength(1);
    expect(plan.estimatedCapabilities).toEqual(["shell.exec:*"]);
    expect(plan.context).toEqual({});
  });

  it("includes context when provided", () => {
    const plan = createPlanGraph({
      instruction: "test",
      agentId: "default",
      steps: [validStep],
      context: { repo: "undoable" },
    });

    expect(plan.context).toEqual({ repo: "undoable" });
  });

  it("aggregates capabilities from all steps", () => {
    const step2: PlanStep = {
      ...validStep,
      id: "s2",
      capabilities: ["fs.write:/src/**"],
    };
    const plan = createPlanGraph({
      instruction: "test",
      agentId: "default",
      steps: [validStep, step2],
    });

    expect(plan.estimatedCapabilities).toEqual(["shell.exec:*", "fs.write:/src/**"]);
  });
});
