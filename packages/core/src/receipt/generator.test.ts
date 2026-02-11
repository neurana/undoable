import { describe, it, expect } from "vitest";
import { ReceiptGenerator } from "./generator.js";
import type { ReceiptInput } from "./types.js";
import type { PlanGraph } from "@undoable/shared";

const mockPlan: PlanGraph = {
  version: 1,
  instruction: "test task",
  context: {},
  steps: [
    { id: "s1", tool: "shell", intent: "run cmd", params: {}, capabilities: ["shell.exec:*"], reversible: true, dependsOn: [] },
    { id: "s2", tool: "fs", intent: "write file", params: {}, capabilities: ["fs.write:*"], reversible: true, dependsOn: ["s1"] },
  ],
  estimatedCapabilities: ["shell.exec:*", "fs.write:*"],
  agentId: "default",
};

const mockInput: ReceiptInput = {
  runId: "run-1",
  userId: "user-1",
  agentId: "default",
  instruction: "test task",
  plan: mockPlan,
  status: "applied",
  fingerprint: "sha256:abc123",
  engineVersion: "0.1.0",
  createdAt: "2025-01-01T00:00:00.000Z",
  completedAt: "2025-01-01T00:01:00.000Z",
  stepResults: [
    { stepId: "s1", tool: "shell", intent: "run cmd", success: true },
    { stepId: "s2", tool: "fs", intent: "write file", success: false, error: "permission denied" },
  ],
  capabilities: ["shell.exec:*", "fs.write:*"],
};

describe("ReceiptGenerator", () => {
  const gen = new ReceiptGenerator();

  describe("generate", () => {
    it("creates receipt with correct fields", () => {
      const receipt = gen.generate(mockInput);

      expect(receipt.runId).toBe("run-1");
      expect(receipt.userId).toBe("user-1");
      expect(receipt.agentId).toBe("default");
      expect(receipt.instruction).toBe("test task");
      expect(receipt.status).toBe("applied");
      expect(receipt.fingerprint).toBe("sha256:abc123");
      expect(receipt.engineVersion).toBe("0.1.0");
      expect(receipt.createdAt).toBe("2025-01-01T00:00:00.000Z");
      expect(receipt.completedAt).toBe("2025-01-01T00:01:00.000Z");
    });

    it("counts steps correctly", () => {
      const receipt = gen.generate(mockInput);
      expect(receipt.stepsTotal).toBe(2);
      expect(receipt.stepsCompleted).toBe(1);
      expect(receipt.stepsFailed).toBe(1);
    });

    it("handles all-success scenario", () => {
      const input = {
        ...mockInput,
        stepResults: [
          { stepId: "s1", tool: "shell", intent: "run", success: true },
          { stepId: "s2", tool: "fs", intent: "write", success: true },
        ],
      };
      const receipt = gen.generate(input);
      expect(receipt.stepsCompleted).toBe(2);
      expect(receipt.stepsFailed).toBe(0);
    });

    it("handles all-failure scenario", () => {
      const input = {
        ...mockInput,
        stepResults: [
          { stepId: "s1", tool: "shell", intent: "run", success: false, error: "fail" },
          { stepId: "s2", tool: "fs", intent: "write", success: false, error: "fail" },
        ],
      };
      const receipt = gen.generate(input);
      expect(receipt.stepsCompleted).toBe(0);
      expect(receipt.stepsFailed).toBe(2);
    });
  });

  describe("computeFingerprint", () => {
    it("returns sha256-prefixed string", () => {
      const fp = gen.computeFingerprint(mockInput);
      expect(fp).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("is deterministic", () => {
      expect(gen.computeFingerprint(mockInput)).toBe(gen.computeFingerprint(mockInput));
    });
  });

  describe("formatReceipt", () => {
    it("formats as JSON", () => {
      const receipt = gen.generate(mockInput);
      const json = gen.formatReceipt(receipt, "json");
      const parsed = JSON.parse(json);
      expect(parsed.runId).toBe("run-1");
    });

    it("formats as markdown", () => {
      const receipt = gen.generate(mockInput);
      const md = gen.formatReceipt(receipt, "md");
      expect(md).toContain("# Run Receipt");
      expect(md).toContain("run-1");
      expect(md).toContain("**applied**");
      expect(md).toContain("Fingerprint");
    });
  });
});
