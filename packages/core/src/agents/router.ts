import type { AgentRoutingRule } from "@undoable/shared";
import type { AgentRegistry } from "./registry.js";

export type RouteInput = {
  instruction: string;
  tags?: string[];
  tool?: string;
};

export type RouteResult = {
  agentId: string;
  matchedBy: "tag" | "pattern" | "tool" | "default";
};

export class AgentRouter {
  constructor(
    private registry: AgentRegistry,
    private rules: AgentRoutingRule[],
  ) {}

  resolve(input: RouteInput): RouteResult {
    for (const rule of this.rules) {
      if (rule.match.tag && input.tags?.some((t) => matchGlob(t, rule.match.tag!))) {
        return { agentId: rule.agentId, matchedBy: "tag" };
      }
      if (rule.match.pattern && matchGlob(input.instruction, rule.match.pattern)) {
        return { agentId: rule.agentId, matchedBy: "pattern" };
      }
      if (rule.match.tool && input.tool === rule.match.tool) {
        return { agentId: rule.agentId, matchedBy: "tool" };
      }
    }
    return { agentId: this.registry.getDefaultId(), matchedBy: "default" };
  }
}

function matchGlob(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return value === pattern;
}
