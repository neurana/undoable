export const PLAN_GRAPH_JSON_SCHEMA = {
  type: "object",
  required: ["version", "instruction", "steps", "agentId"],
  properties: {
    version: { type: "number", const: 1 },
    instruction: { type: "string" },
    context: { type: "object" },
    agentId: { type: "string" },
    steps: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["id", "tool", "intent", "params", "capabilities", "reversible"],
        properties: {
          id: { type: "string" },
          tool: { type: "string" },
          intent: { type: "string" },
          params: { type: "object" },
          capabilities: { type: "array", items: { type: "string" } },
          reversible: { type: "boolean" },
          dependsOn: { type: "array", items: { type: "string" } },
          agentId: { type: "string" },
        },
      },
    },
    estimatedCapabilities: { type: "array", items: { type: "string" } },
    subagentSteps: {
      type: "array",
      items: {
        type: "object",
        required: ["agentId", "steps"],
        properties: {
          agentId: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;
