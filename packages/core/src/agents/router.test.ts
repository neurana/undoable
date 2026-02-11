import { describe, it, expect } from "vitest";
import { AgentRouter } from "./router.js";
import { AgentRegistry } from "./registry.js";
import type { AgentConfig, AgentRoutingRule } from "@undoable/shared";

function createAgent(id: string, isDefault = false): AgentConfig {
  return {
    id,
    model: "gpt-4o",
    skills: [],
    sandbox: { docker: true, network: false, browser: false },
    default: isDefault,
  };
}

function createRegistry(...agents: AgentConfig[]): AgentRegistry {
  const registry = new AgentRegistry();
  for (const agent of agents) {
    registry.register(agent);
  }
  return registry;
}

describe("AgentRouter", () => {
  it("routes by tag match", () => {
    const registry = createRegistry(createAgent("default", true), createAgent("coder"));
    const rules: AgentRoutingRule[] = [{ match: { tag: "code" }, agentId: "coder" }];
    const router = new AgentRouter(registry, rules);

    const result = router.resolve({ instruction: "anything", tags: ["code"] });
    expect(result.agentId).toBe("coder");
    expect(result.matchedBy).toBe("tag");
  });

  it("routes by pattern match", () => {
    const registry = createRegistry(createAgent("default", true), createAgent("writer"));
    const rules: AgentRoutingRule[] = [
      { match: { pattern: "write*" }, agentId: "writer" },
    ];
    const router = new AgentRouter(registry, rules);

    const result = router.resolve({ instruction: "write a blog post" });
    expect(result.agentId).toBe("writer");
    expect(result.matchedBy).toBe("pattern");
  });

  it("routes by tool match", () => {
    const registry = createRegistry(createAgent("default", true), createAgent("browser-agent"));
    const rules: AgentRoutingRule[] = [
      { match: { tool: "browser" }, agentId: "browser-agent" },
    ];
    const router = new AgentRouter(registry, rules);

    const result = router.resolve({ instruction: "anything", tool: "browser" });
    expect(result.agentId).toBe("browser-agent");
    expect(result.matchedBy).toBe("tool");
  });

  it("falls back to default agent when no rules match", () => {
    const registry = createRegistry(createAgent("default", true), createAgent("coder"));
    const rules: AgentRoutingRule[] = [{ match: { tag: "code" }, agentId: "coder" }];
    const router = new AgentRouter(registry, rules);

    const result = router.resolve({ instruction: "make dinner" });
    expect(result.agentId).toBe("default");
    expect(result.matchedBy).toBe("default");
  });

  it("first matching rule wins", () => {
    const registry = createRegistry(
      createAgent("default", true),
      createAgent("a"),
      createAgent("b"),
    );
    const rules: AgentRoutingRule[] = [
      { match: { tag: "x" }, agentId: "a" },
      { match: { tag: "x" }, agentId: "b" },
    ];
    const router = new AgentRouter(registry, rules);

    const result = router.resolve({ instruction: "test", tags: ["x"] });
    expect(result.agentId).toBe("a");
  });

  it("wildcard pattern matches everything", () => {
    const registry = createRegistry(createAgent("default", true), createAgent("catch-all"));
    const rules: AgentRoutingRule[] = [
      { match: { pattern: "*" }, agentId: "catch-all" },
    ];
    const router = new AgentRouter(registry, rules);

    const result = router.resolve({ instruction: "anything at all" });
    expect(result.agentId).toBe("catch-all");
    expect(result.matchedBy).toBe("pattern");
  });

  it("handles empty rules gracefully", () => {
    const registry = createRegistry(createAgent("default", true));
    const router = new AgentRouter(registry, []);

    const result = router.resolve({ instruction: "test" });
    expect(result.agentId).toBe("default");
    expect(result.matchedBy).toBe("default");
  });
});
