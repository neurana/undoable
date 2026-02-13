export type ToolResult = {
  content: string;
  details?: Record<string, unknown>;
};

export type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AgentTool = {
  name: string;
  definition: ToolDefinition;
  execute: ToolExecutor;
};
