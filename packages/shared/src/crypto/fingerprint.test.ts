import { describe, it, expect } from "vitest";
import { computeFingerprint, verifyFingerprint } from "./fingerprint.js";
import type { PlanGraph, Receipt } from "../types/runs.js";

const mockPlan: PlanGraph = {
  version: 1,
  instruction: "test task",
  context: {},
  steps: [
    {
      id: "s1",
      tool: "shell",
      intent: "run command",
      params: { cmd: "echo hi" },
      capabilities: ["shell.exec:*"],
      reversible: true,
      dependsOn: [],
    },
  ],
  estimatedCapabilities: ["shell.exec:*"],
  agentId: "default",
};

describe("computeFingerprint", () => {
  it("returns sha256-prefixed string", () => {
    const fp = computeFingerprint({
      plan: mockPlan,
      capabilities: ["shell.exec:*"],
      engineVersion: "0.1.0",
    });
    expect(fp).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const params = {
      plan: mockPlan,
      capabilities: ["shell.exec:*"],
      engineVersion: "0.1.0",
    };
    expect(computeFingerprint(params)).toBe(computeFingerprint(params));
  });

  it("changes when plan changes", () => {
    const fp1 = computeFingerprint({
      plan: mockPlan,
      capabilities: ["shell.exec:*"],
      engineVersion: "0.1.0",
    });
    const fp2 = computeFingerprint({
      plan: { ...mockPlan, instruction: "different task" },
      capabilities: ["shell.exec:*"],
      engineVersion: "0.1.0",
    });
    expect(fp1).not.toBe(fp2);
  });

  it("changes when engine version changes", () => {
    const fp1 = computeFingerprint({
      plan: mockPlan,
      capabilities: ["shell.exec:*"],
      engineVersion: "0.1.0",
    });
    const fp2 = computeFingerprint({
      plan: mockPlan,
      capabilities: ["shell.exec:*"],
      engineVersion: "0.2.0",
    });
    expect(fp1).not.toBe(fp2);
  });

  it("sorts capabilities for consistency", () => {
    const fp1 = computeFingerprint({
      plan: mockPlan,
      capabilities: ["a", "b", "c"],
      engineVersion: "0.1.0",
    });
    const fp2 = computeFingerprint({
      plan: mockPlan,
      capabilities: ["c", "a", "b"],
      engineVersion: "0.1.0",
    });
    expect(fp1).toBe(fp2);
  });

  it("includes diffHash when provided", () => {
    const fp1 = computeFingerprint({
      plan: mockPlan,
      capabilities: [],
      engineVersion: "0.1.0",
    });
    const fp2 = computeFingerprint({
      plan: mockPlan,
      capabilities: [],
      engineVersion: "0.1.0",
      diffHash: "abc123",
    });
    expect(fp1).not.toBe(fp2);
  });
});

describe("verifyFingerprint", () => {
  it("returns true when fingerprints match", () => {
    const fp = computeFingerprint({
      plan: mockPlan,
      capabilities: [],
      engineVersion: "0.1.0",
    });
    const receipt = { fingerprint: fp } as Receipt;
    expect(verifyFingerprint(receipt, fp)).toBe(true);
  });

  it("returns false when fingerprints differ", () => {
    const receipt = { fingerprint: "sha256:aaa" } as Receipt;
    expect(verifyFingerprint(receipt, "sha256:bbb")).toBe(false);
  });
});
