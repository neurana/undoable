export type ToolResult = {
  success: boolean;
  output?: string;
  error?: string;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
};

export type ToolExecuteParams = {
  runId: string;
  stepId: string;
  params: Record<string, unknown>;
  workingDir: string;
  capabilities: string[];
};

export interface ToolAdapter {
  readonly id: string;
  readonly description: string;
  readonly requiredCapabilityPrefix: string;

  execute(params: ToolExecuteParams): Promise<ToolResult>;
  validate(params: Record<string, unknown>): boolean;
  estimateCapabilities(params: Record<string, unknown>): string[];
}
