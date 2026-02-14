import type { ToolPolicy } from "@undoable/shared";
import type { ToolDefinition } from "../tools/types.js";

export function filterToolsByPolicy(
  definitions: ToolDefinition[],
  policy?: ToolPolicy,
): ToolDefinition[] {
  if (!policy) return definitions;

  const allow = policy.allow?.map((n) => n.toLowerCase());
  const deny = new Set(policy.deny?.map((n) => n.toLowerCase()));

  let filtered = definitions;

  if (allow && allow.length > 0) {
    const allowSet = new Set(allow);
    filtered = filtered.filter((d) => allowSet.has(d.function.name.toLowerCase()));
  }

  if (deny.size > 0) {
    filtered = filtered.filter((d) => !deny.has(d.function.name.toLowerCase()));
  }

  return filtered;
}
