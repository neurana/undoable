import type { SwarmWorkflow } from "./types.js";

export function cleanOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function cleanSkillRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const ref of value) {
    if (typeof ref !== "string") continue;
    const trimmed = ref.trim();
    if (trimmed.length > 0) unique.add(trimmed);
  }
  return [...unique];
}

export function cloneWorkflow(workflow: SwarmWorkflow): SwarmWorkflow {
  return structuredClone(workflow);
}
