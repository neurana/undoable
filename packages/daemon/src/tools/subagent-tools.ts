import type { AgentTool } from "./types.js";
import type { AgentRegistry } from "@undoable/core";

export type SubagentDeps = {
  agentRegistry: AgentRegistry;
  callLLM: (messages: unknown[], toolDefs: unknown[], stream: boolean) => Promise<unknown>;
  toolExecute: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  toolDefs: unknown[];
  maxIterations?: number;
};

export function createSubagentTools(deps: SubagentDeps): AgentTool[] {
  const spawnTool: AgentTool = {
    name: "subagent_spawn",
    definition: {
      type: "function",
      function: {
        name: "subagent_spawn",
        description: "Spawn a subagent to handle a subtask. The subagent runs in its own session with the specified agent and returns the final response.",
        parameters: {
          type: "object",
          properties: {
            task: { type: "string", description: "Task description for the subagent" },
            agentId: { type: "string", description: "Agent ID to use (optional, defaults to current)" },
            context: { type: "string", description: "Additional context to provide" },
          },
          required: ["task"],
        },
      },
    },
    execute: async (args) => {
      const task = args.task as string;
      const agentId = args.agentId as string | undefined;
      const context = args.context as string | undefined;
      if (!task) return { error: "task is required" };

      const agent = agentId ? deps.agentRegistry.get(agentId) : undefined;
      const systemContent = [
        "You are a subagent. Complete the given task concisely and return results.",
        agent?.instructions ? `\n## Instructions\n${agent.instructions}` : "",
        context ? `\n## Context\n${context}` : "",
      ].filter(Boolean).join("");

      const messages: unknown[] = [
        { role: "system", content: systemContent },
        { role: "user", content: task },
      ];

      const maxIter = deps.maxIterations ?? 5;
      let lastContent = "";

      for (let i = 0; i < maxIter; i++) {
        const response = await deps.callLLM(messages, deps.toolDefs, false) as {
          content: string | null;
          tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
        };

        if (response.content) lastContent = response.content;
        if (!response.tool_calls?.length) break;

        messages.push({ role: "assistant", content: response.content, tool_calls: response.tool_calls });

        for (const tc of response.tool_calls) {
          let result: string;
          try {
            const toolArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
            const output = await deps.toolExecute(tc.function.name, toolArgs);
            result = typeof output === "string" ? output : JSON.stringify(output);
          } catch (err) {
            result = JSON.stringify({ error: String(err) });
          }
          messages.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
      }

      return {
        completed: true,
        agentId: agentId ?? "default",
        response: lastContent,
      };
    },
  };

  const listAgentsTool: AgentTool = {
    name: "subagent_list",
    definition: {
      type: "function",
      function: {
        name: "subagent_list",
        description: "List available agents that can be used with subagent_spawn.",
        parameters: { type: "object", properties: {} },
      },
    },
    execute: async () => {
      const agents = deps.agentRegistry.list();
      return {
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name ?? a.id,
          model: a.model,
        })),
      };
    },
  };

  return [spawnTool, listAgentsTool];
}
