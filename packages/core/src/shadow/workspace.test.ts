import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ShadowWorkspaceManager } from "./workspace.js";

let manager: ShadowWorkspaceManager;
let tmpDir: string;
let sourceDir: string;

beforeEach(async () => {
  manager = new ShadowWorkspaceManager();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-shadow-test-"));
  sourceDir = path.join(tmpDir, "source");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "file.txt"), "hello");
  await fs.mkdir(path.join(sourceDir, "sub"));
  await fs.writeFile(path.join(sourceDir, "sub/nested.txt"), "world");
  await fs.mkdir(path.join(sourceDir, "node_modules"));
  await fs.writeFile(path.join(sourceDir, "node_modules/pkg.js"), "skip");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ShadowWorkspaceManager", () => {
  describe("create (copy strategy)", () => {
    it("creates shadow workspace with copied files", async () => {
      const info = await manager.create({
        runId: "run-1",
        sourceDir,
        baseDir: tmpDir,
        strategy: "copy",
      });

      expect(info.runId).toBe("run-1");
      expect(info.strategy).toBe("copy");
      expect(info.createdAt).toBeTruthy();

      const content = await fs.readFile(path.join(info.workspacePath, "file.txt"), "utf-8");
      expect(content).toBe("hello");

      const nested = await fs.readFile(path.join(info.workspacePath, "sub/nested.txt"), "utf-8");
      expect(nested).toBe("world");
    });

    it("excludes node_modules by default", async () => {
      const info = await manager.create({
        runId: "run-2",
        sourceDir,
        baseDir: tmpDir,
        strategy: "copy",
      });

      const nmExists = await manager.exists(path.join(info.workspacePath, "node_modules"));
      expect(nmExists).toBe(false);
    });

    it("respects custom exclude list", async () => {
      const info = await manager.create({
        runId: "run-3",
        sourceDir,
        baseDir: tmpDir,
        strategy: "copy",
        exclude: ["sub"],
      });

      const subExists = await manager.exists(path.join(info.workspacePath, "sub"));
      expect(subExists).toBe(false);

      const fileContent = await fs.readFile(path.join(info.workspacePath, "file.txt"), "utf-8");
      expect(fileContent).toBe("hello");
    });
  });

  describe("create (docker strategy)", () => {
    it("creates empty workspace directory for docker strategy", async () => {
      const info = await manager.create({
        runId: "run-4",
        sourceDir,
        baseDir: tmpDir,
        strategy: "docker",
      });

      expect(info.strategy).toBe("docker");
      const exists = await manager.exists(info.workspacePath);
      expect(exists).toBe(true);

      const entries = await fs.readdir(info.workspacePath);
      expect(entries).toHaveLength(0);
    });
  });

  describe("destroy", () => {
    it("removes the workspace directory", async () => {
      const info = await manager.create({
        runId: "run-5",
        sourceDir,
        baseDir: tmpDir,
        strategy: "copy",
      });

      await manager.destroy(info.workspacePath);
      const exists = await manager.exists(info.workspacePath);
      expect(exists).toBe(false);
    });
  });

  describe("exists", () => {
    it("returns true for existing path", async () => {
      expect(await manager.exists(sourceDir)).toBe(true);
    });

    it("returns false for non-existing path", async () => {
      expect(await manager.exists("/nonexistent/path")).toBe(false);
    });
  });
});
