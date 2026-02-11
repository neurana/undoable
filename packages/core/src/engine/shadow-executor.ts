import type { ToolAdapter, ToolExecuteParams, ToolResult } from "../tools/types.js";
import type { PlanStep } from "@undoable/shared";

export type ShadowBackend = "docker" | "local";

export type ShadowExecutorConfig = {
  backend: ShadowBackend;
  workspacePath: string;
  runId: string;
};

export type StepResult = {
  stepId: string;
  tool: string;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
};

export class ShadowExecutor {
  private config: ShadowExecutorConfig;
  private adapters: Map<string, ToolAdapter>;
  private results: StepResult[] = [];

  constructor(config: ShadowExecutorConfig, adapters: Map<string, ToolAdapter>) {
    this.config = config;
    this.adapters = adapters;
  }

  async executeStep(step: PlanStep): Promise<StepResult> {
    const adapter = this.adapters.get(step.tool);
    if (!adapter) {
      const result: StepResult = {
        stepId: step.id,
        tool: step.tool,
        success: false,
        error: `No adapter registered for tool: ${step.tool}`,
        durationMs: 0,
      };
      this.results.push(result);
      return result;
    }

    const execParams: ToolExecuteParams = {
      runId: this.config.runId,
      stepId: step.id,
      params: step.params,
      workingDir: this.config.workspacePath,
      capabilities: step.capabilities,
    };

    const start = Date.now();
    let toolResult: ToolResult;

    try {
      toolResult = await adapter.execute(execParams);
    } catch (err) {
      toolResult = {
        success: false,
        output: "",
        error: `Adapter threw: ${(err as Error).message}`,
      };
    }

    const result: StepResult = {
      stepId: step.id,
      tool: step.tool,
      success: toolResult.success,
      output: toolResult.output,
      error: toolResult.error,
      durationMs: Date.now() - start,
    };

    this.results.push(result);
    return result;
  }

  async executePlan(steps: PlanStep[]): Promise<StepResult[]> {
    const resolved = new Set<string>();

    for (const step of steps) {
      const unmetDeps = step.dependsOn.filter((d) => !resolved.has(d));
      if (unmetDeps.length > 0) {
        const failedDep = unmetDeps.find((d) =>
          this.results.some((r) => r.stepId === d && !r.success),
        );
        if (failedDep) {
          const result: StepResult = {
            stepId: step.id,
            tool: step.tool,
            success: false,
            error: `Skipped: dependency "${failedDep}" failed`,
            durationMs: 0,
          };
          this.results.push(result);
          continue;
        }
      }

      const result = await this.executeStep(step);
      if (result.success) {
        resolved.add(step.id);
      }
    }

    return [...this.results];
  }

  getResults(): StepResult[] {
    return [...this.results];
  }

  reset(): void {
    this.results = [];
  }
}

export function detectBackend(): ShadowBackend {
  try {
    const fs = require("node:fs");
    fs.accessSync("/var/run/docker.sock");
    return "docker";
  } catch {
    return "local";
  }
}
