import * as fs from "node:fs";
import type { LLMProvider, LLMContext, LLMResult } from "../types.js";
import type { PlanGraph } from "@undoable/shared";

export type ManualProviderConfig = {
  planPath?: string;
};

export class ManualProvider implements LLMProvider {
  readonly id = "manual";
  readonly name = "Manual (File)";

  private config: ManualProviderConfig;

  constructor(config: ManualProviderConfig = {}) {
    this.config = config;
  }

  async generatePlan(context: LLMContext): Promise<LLMResult> {
    const start = Date.now();
    const planPath = this.config.planPath ?? this.findPlanPath(context);
    if (!planPath) {
      throw new Error("No plan file specified. Use --plan-file or place a plan.json in the working directory.");
    }
    const plan = this.loadPlan(planPath);
    return {
      plan,
      model: "file",
      provider: this.id,
      durationMs: Date.now() - start,
      finishReason: "file_loaded",
    };
  }

  loadPlan(filePath: string): PlanGraph {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Plan file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`Invalid JSON in plan file: ${filePath}`);
    }

    const plan = parsed as Record<string, unknown>;
    if (!plan.version || !plan.steps) {
      throw new Error(`Invalid PlanGraph structure in: ${filePath}`);
    }

    return plan as unknown as PlanGraph;
  }

  private findPlanPath(context: LLMContext): string | null {
    const candidates = ["plan.json", ".undoable/plan.json"];
    const metadata = context.metadata as Record<string, string> | undefined;
    const workDir = metadata?.workingDir ?? process.cwd();

    for (const candidate of candidates) {
      const full = `${workDir}/${candidate}`;
      if (fs.existsSync(full)) return full;
    }
    return null;
  }
}
