import { describe, it, expect } from "vitest";
import { AgentRegistry } from "./registry.js";
import type { AgentConfig } from "@undoable/shared";

function createAgent(id: string, isDefault = false): AgentConfig {
  return {
    id,
    model: "gpt-4o",
    skills: [],
    sandbox: { docker: true, network: false, browser: false },
    default: isDefault,
  };
}

describe("AgentRegistry", () => {
  it("registers and retrieves an agent", () => {
    const registry = new AgentRegistry();
    const agent = createAgent("alpha");
    registry.register(agent);

    expect(registry.get("alpha")).toBe(agent);
  });

  it("returns undefined for unknown agent", () => {
    const registry = new AgentRegistry();
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("require throws for unknown agent", () => {
    const registry = new AgentRegistry();
    expect(() => registry.require("unknown")).toThrow('Agent "unknown" not found');
  });

  it("first registered agent becomes default", () => {
    const registry = new AgentRegistry();
    registry.register(createAgent("alpha"));
    registry.register(createAgent("beta"));

    expect(registry.getDefault().id).toBe("alpha");
    expect(registry.getDefaultId()).toBe("alpha");
  });

  it("explicit default overrides first-registered", () => {
    const registry = new AgentRegistry();
    registry.register(createAgent("alpha"));
    registry.register(createAgent("beta", true));

    expect(registry.getDefault().id).toBe("beta");
  });

  it("getDefault throws when no agents registered", () => {
    const registry = new AgentRegistry();
    expect(() => registry.getDefault()).toThrow("No agents registered");
  });

  it("getDefaultId throws when no agents registered", () => {
    const registry = new AgentRegistry();
    expect(() => registry.getDefaultId()).toThrow("No agents registered");
  });

  it("lists all agents", () => {
    const registry = new AgentRegistry();
    registry.register(createAgent("alpha"));
    registry.register(createAgent("beta"));

    expect(registry.list()).toHaveLength(2);
  });

  it("listIds returns agent IDs", () => {
    const registry = new AgentRegistry();
    registry.register(createAgent("alpha"));
    registry.register(createAgent("beta"));

    expect(registry.listIds()).toEqual(["alpha", "beta"]);
  });
});
