import { describe, it, expect, beforeEach, vi } from "vitest";
import { SandboxOrchestrator } from "./orchestrator.js";
import type { ContainerManager } from "./manager.js";

function mockManager(): ContainerManager {
  return {
    create: vi.fn().mockResolvedValue("container-123"),
    start: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "diff output", stderr: "" }),
    status: vi.fn().mockResolvedValue({ id: "container-123", running: true }),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  } as unknown as ContainerManager;
}

let manager: ReturnType<typeof mockManager>;
let orchestrator: SandboxOrchestrator;

beforeEach(() => {
  manager = mockManager();
  orchestrator = new SandboxOrchestrator(manager as unknown as ContainerManager);
});

describe("SandboxOrchestrator", () => {
  describe("createSandbox", () => {
    it("creates and starts a container", async () => {
      const session = await orchestrator.createSandbox("run-1", {
        workspacePath: "/tmp/ws",
      });

      expect(session.containerId).toBe("container-123");
      expect(session.workspacePath).toBe("/tmp/ws");
      expect(session.createdAt).toBeTruthy();
      expect(manager.create).toHaveBeenCalledOnce();
      expect(manager.start).toHaveBeenCalledWith("container-123");
    });

    it("uses default image when not specified", async () => {
      await orchestrator.createSandbox("run-2", { workspacePath: "/tmp/ws" });
      const createCall = (manager.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(createCall.image).toBe("undoable-sandbox:latest");
    });

    it("uses custom image", async () => {
      await orchestrator.createSandbox("run-3", {
        workspacePath: "/tmp/ws",
        image: "custom:v1",
      });
      const createCall = (manager.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(createCall.image).toBe("custom:v1");
    });

    it("applies network policy", async () => {
      await orchestrator.createSandbox("run-4", {
        workspacePath: "/tmp/ws",
        networkPolicy: { mode: "none" },
      });
      const createCall = (manager.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(createCall.networkMode).toBe("none");
    });

    it("passes resource limits", async () => {
      await orchestrator.createSandbox("run-5", {
        workspacePath: "/tmp/ws",
        resourceLimits: { memoryMb: 512, cpus: 2 },
      });
      const createCall = (manager.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(createCall.resourceLimits).toEqual({ memoryMb: 512, cpus: 2 });
    });

    it("adds read-only mounts", async () => {
      await orchestrator.createSandbox("run-6", {
        workspacePath: "/tmp/ws",
        readOnlyMounts: [{ host: "/data", container: "/mnt/data" }],
      });
      const createCall = (manager.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(createCall.mounts).toHaveLength(2);
      expect(createCall.mounts[1]).toEqual({ source: "/data", target: "/mnt/data", readOnly: true });
    });
  });

  describe("exec", () => {
    it("executes command in sandbox", async () => {
      await orchestrator.createSandbox("run-1", { workspacePath: "/tmp/ws" });
      const result = await orchestrator.exec("run-1", ["echo", "hi"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("diff output");
      expect(manager.exec).toHaveBeenCalledWith("container-123", ["echo", "hi"]);
    });

    it("throws for unknown run", async () => {
      await expect(orchestrator.exec("nope", ["echo"])).rejects.toThrow("No sandbox session");
    });
  });

  describe("extractDiff", () => {
    it("returns git diff output", async () => {
      await orchestrator.createSandbox("run-1", { workspacePath: "/tmp/ws" });
      const diff = await orchestrator.extractDiff("run-1");
      expect(diff).toBe("diff output");
    });

    it("falls back to git status on non-zero exit", async () => {
      (manager.exec as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "not a git repo" })
        .mockResolvedValueOnce({ exitCode: 0, stdout: "?? new.txt", stderr: "" });

      await orchestrator.createSandbox("run-1", { workspacePath: "/tmp/ws" });
      const diff = await orchestrator.extractDiff("run-1");
      expect(diff).toBe("?? new.txt");
    });
  });

  describe("destroySandbox", () => {
    it("stops and removes container", async () => {
      await orchestrator.createSandbox("run-1", { workspacePath: "/tmp/ws" });
      await orchestrator.destroySandbox("run-1");
      expect(manager.stop).toHaveBeenCalledWith("container-123");
      expect(manager.remove).toHaveBeenCalledWith("container-123");
      expect(orchestrator.hasSession("run-1")).toBe(false);
    });

    it("does nothing for unknown run", async () => {
      await expect(orchestrator.destroySandbox("nope")).resolves.toBeUndefined();
    });
  });

  describe("isRunning", () => {
    it("returns true for running container", async () => {
      await orchestrator.createSandbox("run-1", { workspacePath: "/tmp/ws" });
      expect(await orchestrator.isRunning("run-1")).toBe(true);
    });

    it("returns false for unknown run", async () => {
      expect(await orchestrator.isRunning("nope")).toBe(false);
    });
  });

  describe("hasSession", () => {
    it("returns true after create", async () => {
      await orchestrator.createSandbox("run-1", { workspacePath: "/tmp/ws" });
      expect(orchestrator.hasSession("run-1")).toBe(true);
    });

    it("returns false before create", () => {
      expect(orchestrator.hasSession("nope")).toBe(false);
    });
  });
});
