import type { Phase, RunStatus } from "@undoable/shared";
import type { EngineRunContext, PhaseResult } from "./types.js";

const PHASE_TRANSITIONS: Record<Phase, { next?: Phase; status: RunStatus }> = {
  plan: { next: "shadow", status: "planned" },
  shadow: { next: "apply", status: "shadowed" },
  apply: { status: "applied" },
  undo: { status: "undone" },
};

export class PhaseOrchestrator {
  private context: EngineRunContext;

  constructor(context: EngineRunContext) {
    this.context = context;
  }

  get currentPhase(): Phase | undefined {
    return this.context.currentPhase;
  }

  get status(): RunStatus {
    return this.context.status;
  }

  async runPhase(phase: Phase): Promise<PhaseResult> {
    this.context.currentPhase = phase;
    this.context.status = phase === "plan" ? "planning" : `${phase}ing` as RunStatus;

    try {
      const result = await this.executePhase(phase);
      if (result.success) {
        const transition = PHASE_TRANSITIONS[phase]!;
        this.context.status = transition.status;
      } else {
        this.context.status = "failed";
      }
      return result;
    } catch (error) {
      this.context.status = "failed";
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executePhase(_phase: Phase): Promise<PhaseResult> {
    return { success: true };
  }

  pause(): void {
    this.context.status = "paused";
  }

  resume(): void {
    if (this.context.currentPhase) {
      this.context.status = `${this.context.currentPhase}ing` as RunStatus;
    }
  }

  cancel(): void {
    this.context.status = "cancelled";
  }
}
