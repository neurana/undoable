import { describe, it, expect } from "vitest";
import { resolveRunMode, shouldAutoApprove } from "./run-mode.js";

describe("resolveRunMode", () => {
  it("defaults to supervised with 50 iterations", () => {
    const config = resolveRunMode();
    expect(config.mode).toBe("supervised");
    expect(config.maxIterations).toBe(50);
    expect(config.dangerouslySkipPermissions).toBe(false);
  });

  it("autonomous mode has 200 iterations", () => {
    const config = resolveRunMode({ mode: "autonomous" });
    expect(config.mode).toBe("autonomous");
    expect(config.maxIterations).toBe(200);
  });

  it("supervised mode has 50 iterations", () => {
    const config = resolveRunMode({ mode: "supervised" });
    expect(config.mode).toBe("supervised");
    expect(config.maxIterations).toBe(50);
  });

  it("custom maxIterations overrides default", () => {
    const config = resolveRunMode({ mode: "interactive", maxIterations: 30 });
    expect(config.maxIterations).toBe(30);
  });

  it("dangerouslySkipPermissions forces autonomous mode", () => {
    const config = resolveRunMode({ dangerouslySkipPermissions: true });
    expect(config.mode).toBe("autonomous");
    expect(config.maxIterations).toBe(200);
    expect(config.dangerouslySkipPermissions).toBe(true);
  });

  it("dangerouslySkipPermissions overrides explicit mode", () => {
    const config = resolveRunMode({ mode: "interactive", dangerouslySkipPermissions: true });
    expect(config.mode).toBe("autonomous");
  });
});

describe("shouldAutoApprove", () => {
  it("returns true for autonomous mode", () => {
    expect(shouldAutoApprove(resolveRunMode({ mode: "autonomous" }))).toBe(true);
  });

  it("returns true when dangerouslySkipPermissions", () => {
    expect(shouldAutoApprove(resolveRunMode({ dangerouslySkipPermissions: true }))).toBe(true);
  });

  it("returns false for interactive mode", () => {
    expect(shouldAutoApprove(resolveRunMode({ mode: "interactive" }))).toBe(false);
  });

  it("returns false for supervised mode", () => {
    expect(shouldAutoApprove(resolveRunMode({ mode: "supervised" }))).toBe(false);
  });
});
