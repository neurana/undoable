import type { PlanGraph, PlanStep } from "@undoable/shared";

export function validatePlanGraph(plan: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!plan || typeof plan !== "object") {
    return { valid: false, errors: ["Plan must be an object"] };
  }

  const p = plan as Record<string, unknown>;

  if (p.version !== 1) errors.push("version must be 1");
  if (typeof p.instruction !== "string" || !p.instruction) errors.push("instruction is required");
  if (typeof p.agentId !== "string" || !p.agentId) errors.push("agentId is required");
  if (!Array.isArray(p.steps) || p.steps.length === 0) errors.push("at least one step is required");

  if (Array.isArray(p.steps)) {
    const ids = new Set<string>();
    for (let i = 0; i < p.steps.length; i++) {
      const step = p.steps[i] as Record<string, unknown>;
      if (!step.id) errors.push(`step[${i}]: id is required`);
      if (!step.tool) errors.push(`step[${i}]: tool is required`);
      if (!step.intent) errors.push(`step[${i}]: intent is required`);
      if (typeof step.reversible !== "boolean") errors.push(`step[${i}]: reversible must be boolean`);
      if (step.id && ids.has(step.id as string)) errors.push(`step[${i}]: duplicate id "${step.id}"`);
      if (step.id) ids.add(step.id as string);

      if (Array.isArray(step.dependsOn)) {
        for (const dep of step.dependsOn) {
          if (!ids.has(dep as string)) {
            errors.push(`step[${i}]: dependency "${dep}" not found in preceding steps`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function createPlanGraph(params: {
  instruction: string;
  agentId: string;
  steps: PlanStep[];
  context?: Record<string, unknown>;
}): PlanGraph {
  return {
    version: 1,
    instruction: params.instruction,
    context: params.context ?? {},
    steps: params.steps,
    estimatedCapabilities: params.steps.flatMap((s) => s.capabilities),
    agentId: params.agentId,
  };
}
