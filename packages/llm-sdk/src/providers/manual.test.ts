import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ManualProvider } from "./manual.js";

let tmpDir: string;

const validPlan = {
  version: 1,
  instruction: "test task",
  context: {},
  steps: [
    { id: "s1", tool: "shell", intent: "run", params: {}, capabilities: ["shell.exec:*"], reversible: true, dependsOn: [] },
  ],
  estimatedCapabilities: ["shell.exec:*"],
  agentId: "default",
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "undoable-manual-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ManualProvider", () => {
  it("has correct id and name", () => {
    const provider = new ManualProvider();
    expect(provider.id).toBe("manual");
    expect(provider.name).toBe("Manual (File)");
  });

  describe("loadPlan", () => {
    it("loads valid plan from file", () => {
      const filePath = path.join(tmpDir, "plan.json");
      fs.writeFileSync(filePath, JSON.stringify(validPlan));

      const provider = new ManualProvider();
      const plan = provider.loadPlan(filePath);
      expect(plan.version).toBe(1);
      expect(plan.steps).toHaveLength(1);
      expect(plan.agentId).toBe("default");
    });

    it("throws for non-existent file", () => {
      const provider = new ManualProvider();
      expect(() => provider.loadPlan("/nope/plan.json")).toThrow("not found");
    });

    it("throws for invalid JSON", () => {
      const filePath = path.join(tmpDir, "bad.json");
      fs.writeFileSync(filePath, "not json {{{");

      const provider = new ManualProvider();
      expect(() => provider.loadPlan(filePath)).toThrow("Invalid JSON");
    });

    it("throws for invalid PlanGraph structure", () => {
      const filePath = path.join(tmpDir, "incomplete.json");
      fs.writeFileSync(filePath, JSON.stringify({ foo: "bar" }));

      const provider = new ManualProvider();
      expect(() => provider.loadPlan(filePath)).toThrow("Invalid PlanGraph");
    });
  });

  describe("generatePlan", () => {
    it("loads plan from configured path", async () => {
      const filePath = path.join(tmpDir, "plan.json");
      fs.writeFileSync(filePath, JSON.stringify(validPlan));

      const provider = new ManualProvider({ planPath: filePath });
      const result = await provider.generatePlan({ instruction: "test" });
      expect(result.plan.version).toBe(1);
    });

    it("auto-discovers plan.json in working directory", async () => {
      fs.writeFileSync(path.join(tmpDir, "plan.json"), JSON.stringify(validPlan));

      const provider = new ManualProvider();
      const result = await provider.generatePlan({
        instruction: "test",
        metadata: { workingDir: tmpDir },
      });
      expect(result.plan.version).toBe(1);
    });

    it("throws when no plan file found", async () => {
      const provider = new ManualProvider();
      await expect(
        provider.generatePlan({ instruction: "test", metadata: { workingDir: tmpDir } }),
      ).rejects.toThrow("No plan file");
    });
  });
});
