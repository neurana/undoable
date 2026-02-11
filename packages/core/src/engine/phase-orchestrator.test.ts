import { describe, it, expect } from "vitest";
import { PhaseOrchestrator } from "./phase-orchestrator.js";
import type { EngineRunContext } from "./types.js";

function createContext(overrides?: Partial<EngineRunContext>): EngineRunContext {
  return {
    runId: "run-1",
    userId: "user-1",
    agentId: "default",
    instruction: "test task",
    workingDir: "/tmp/test",
    status: "created",
    ...overrides,
  };
}

describe("PhaseOrchestrator", () => {
  it("starts with correct initial state", () => {
    const orch = new PhaseOrchestrator(createContext());
    expect(orch.currentPhase).toBeUndefined();
    expect(orch.status).toBe("created");
  });

  it("runs plan phase and transitions to planned", async () => {
    const orch = new PhaseOrchestrator(createContext());
    const result = await orch.runPhase("plan");

    expect(result.success).toBe(true);
    expect(orch.status).toBe("planned");
  });

  it("runs shadow phase and transitions to shadowed", async () => {
    const orch = new PhaseOrchestrator(createContext({ status: "planned" }));
    const result = await orch.runPhase("shadow");

    expect(result.success).toBe(true);
    expect(orch.status).toBe("shadowed");
  });

  it("runs apply phase and transitions to applied", async () => {
    const orch = new PhaseOrchestrator(createContext({ status: "shadowed" }));
    const result = await orch.runPhase("apply");

    expect(result.success).toBe(true);
    expect(orch.status).toBe("applied");
  });

  it("runs undo phase and transitions to undone", async () => {
    const orch = new PhaseOrchestrator(createContext({ status: "applied" }));
    const result = await orch.runPhase("undo");

    expect(result.success).toBe(true);
    expect(orch.status).toBe("undone");
  });

  it("pause sets status to paused", () => {
    const orch = new PhaseOrchestrator(createContext());
    orch.pause();
    expect(orch.status).toBe("paused");
  });

  it("resume restores phase-based status", async () => {
    const orch = new PhaseOrchestrator(createContext());
    await orch.runPhase("plan");
    orch.pause();
    expect(orch.status).toBe("paused");

    orch.resume();
    expect(orch.status).toBe("planing");
  });

  it("cancel sets status to cancelled", () => {
    const orch = new PhaseOrchestrator(createContext());
    orch.cancel();
    expect(orch.status).toBe("cancelled");
  });

  it("tracks current phase", async () => {
    const orch = new PhaseOrchestrator(createContext());
    expect(orch.currentPhase).toBeUndefined();

    await orch.runPhase("plan");
    expect(orch.currentPhase).toBe("plan");

    await orch.runPhase("shadow");
    expect(orch.currentPhase).toBe("shadow");
  });
});
