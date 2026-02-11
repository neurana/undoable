import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { CheckpointManager } from "./checkpoint-manager.js";
import type { CheckpointData } from "./types.js";

let manager: CheckpointManager;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-ckpt-test-"));
  manager = new CheckpointManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const mockCheckpoint: CheckpointData = {
  runId: "run-1",
  status: "shadowing",
  currentPhase: "shadow",
  completedStepIds: ["s1"],
  failedStepIds: [],
  stepResults: { s1: { success: true, output: "ok" } },
  metadata: { attempt: 1 },
  savedAt: "",
};

describe("CheckpointManager", () => {
  describe("save + load", () => {
    it("saves and loads checkpoint data", async () => {
      await manager.save(mockCheckpoint);
      const loaded = await manager.load("run-1");

      expect(loaded).not.toBeNull();
      expect(loaded!.runId).toBe("run-1");
      expect(loaded!.status).toBe("shadowing");
      expect(loaded!.currentPhase).toBe("shadow");
      expect(loaded!.completedStepIds).toEqual(["s1"]);
      expect(loaded!.stepResults.s1).toEqual({ success: true, output: "ok" });
    });

    it("sets savedAt timestamp on save", async () => {
      await manager.save(mockCheckpoint);
      const loaded = await manager.load("run-1");
      expect(loaded!.savedAt).toBeTruthy();
      expect(new Date(loaded!.savedAt).getTime()).toBeGreaterThan(0);
    });
  });

  describe("load", () => {
    it("returns null for non-existent checkpoint", async () => {
      const loaded = await manager.load("nonexistent");
      expect(loaded).toBeNull();
    });
  });

  describe("exists", () => {
    it("returns true after save", async () => {
      await manager.save(mockCheckpoint);
      expect(await manager.exists("run-1")).toBe(true);
    });

    it("returns false for non-existent", async () => {
      expect(await manager.exists("nope")).toBe(false);
    });
  });

  describe("remove", () => {
    it("removes existing checkpoint", async () => {
      await manager.save(mockCheckpoint);
      await manager.remove("run-1");
      expect(await manager.exists("run-1")).toBe(false);
    });

    it("does not throw for non-existent checkpoint", async () => {
      await expect(manager.remove("nope")).resolves.toBeUndefined();
    });
  });

  describe("overwrite", () => {
    it("overwrites existing checkpoint", async () => {
      await manager.save(mockCheckpoint);
      await manager.save({ ...mockCheckpoint, status: "applied", completedStepIds: ["s1", "s2"] });

      const loaded = await manager.load("run-1");
      expect(loaded!.status).toBe("applied");
      expect(loaded!.completedStepIds).toEqual(["s1", "s2"]);
    });
  });
});
