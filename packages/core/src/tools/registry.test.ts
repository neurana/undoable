import { describe, it, expect } from "vitest";
import { ToolRegistry } from "./registry.js";
import type { ToolAdapter, ToolExecuteParams, ToolResult } from "./types.js";

function createMockAdapter(id: string): ToolAdapter {
  return {
    id,
    description: `Mock ${id}`,
    requiredCapabilityPrefix: `${id}.exec`,
    execute: async (_params: ToolExecuteParams): Promise<ToolResult> => ({
      success: true,
      output: "ok",
    }),
    validate: () => true,
    estimateCapabilities: () => [`${id}.exec:*`],
  };
}

describe("ToolRegistry", () => {
  it("registers and retrieves an adapter", () => {
    const registry = new ToolRegistry();
    const adapter = createMockAdapter("shell");
    registry.register(adapter);

    expect(registry.get("shell")).toBe(adapter);
  });

  it("returns undefined for unknown adapter", () => {
    const registry = new ToolRegistry();
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("require throws for unknown adapter", () => {
    const registry = new ToolRegistry();
    expect(() => registry.require("unknown")).toThrow('Tool adapter "unknown" not found');
  });

  it("require returns adapter when found", () => {
    const registry = new ToolRegistry();
    const adapter = createMockAdapter("shell");
    registry.register(adapter);

    expect(registry.require("shell")).toBe(adapter);
  });

  it("throws on duplicate registration", () => {
    const registry = new ToolRegistry();
    registry.register(createMockAdapter("shell"));

    expect(() => registry.register(createMockAdapter("shell"))).toThrow(
      'Tool adapter "shell" already registered',
    );
  });

  it("lists all registered adapters", () => {
    const registry = new ToolRegistry();
    registry.register(createMockAdapter("shell"));
    registry.register(createMockAdapter("fs"));
    registry.register(createMockAdapter("git"));

    const list = registry.list();
    expect(list).toHaveLength(3);
    expect(list.map((a) => a.id)).toEqual(["shell", "fs", "git"]);
  });

  it("has returns correct boolean", () => {
    const registry = new ToolRegistry();
    registry.register(createMockAdapter("shell"));

    expect(registry.has("shell")).toBe(true);
    expect(registry.has("unknown")).toBe(false);
  });
});
