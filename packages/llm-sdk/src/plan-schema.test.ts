import { describe, it, expect } from "vitest";
import { PLAN_GRAPH_JSON_SCHEMA } from "./plan-schema.js";

describe("PLAN_GRAPH_JSON_SCHEMA", () => {
  it("is an object type schema", () => {
    expect(PLAN_GRAPH_JSON_SCHEMA.type).toBe("object");
  });

  it("requires version, instruction, steps, agentId", () => {
    expect(PLAN_GRAPH_JSON_SCHEMA.required).toContain("version");
    expect(PLAN_GRAPH_JSON_SCHEMA.required).toContain("instruction");
    expect(PLAN_GRAPH_JSON_SCHEMA.required).toContain("steps");
    expect(PLAN_GRAPH_JSON_SCHEMA.required).toContain("agentId");
  });

  it("version is const 1", () => {
    expect(PLAN_GRAPH_JSON_SCHEMA.properties.version.const).toBe(1);
  });

  it("steps has minItems 1", () => {
    expect(PLAN_GRAPH_JSON_SCHEMA.properties.steps.minItems).toBe(1);
  });

  it("step items require id, tool, intent, params, capabilities, reversible", () => {
    const stepRequired = PLAN_GRAPH_JSON_SCHEMA.properties.steps.items.required;
    expect(stepRequired).toContain("id");
    expect(stepRequired).toContain("tool");
    expect(stepRequired).toContain("intent");
    expect(stepRequired).toContain("params");
    expect(stepRequired).toContain("capabilities");
    expect(stepRequired).toContain("reversible");
  });

  it("includes subagentSteps property", () => {
    expect(PLAN_GRAPH_JSON_SCHEMA.properties.subagentSteps).toBeDefined();
    expect(PLAN_GRAPH_JSON_SCHEMA.properties.subagentSteps.type).toBe("array");
  });

  it("subagentSteps items require agentId and steps", () => {
    const subRequired = PLAN_GRAPH_JSON_SCHEMA.properties.subagentSteps.items.required;
    expect(subRequired).toContain("agentId");
    expect(subRequired).toContain("steps");
  });

  it("step items include optional agentId and dependsOn", () => {
    const stepProps = PLAN_GRAPH_JSON_SCHEMA.properties.steps.items.properties;
    expect(stepProps.agentId).toBeDefined();
    expect(stepProps.dependsOn).toBeDefined();
  });
});
