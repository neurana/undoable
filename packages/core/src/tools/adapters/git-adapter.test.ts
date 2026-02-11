import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { GitAdapter } from "./git-adapter.js";

let adapter: GitAdapter;
let tmpDir: string;

beforeEach(async () => {
  adapter = new GitAdapter();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-git-test-"));
  execFileSync("git", ["init"], { cwd: tmpDir });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: tmpDir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: tmpDir });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function exec(action: string, params: Record<string, unknown> = {}) {
  return adapter.execute({
    runId: "r1",
    stepId: "s1",
    params: { action, ...params },
    workingDir: tmpDir,
    capabilities: [],
  });
}

describe("GitAdapter", () => {
  it("has correct id and prefix", () => {
    expect(adapter.id).toBe("git");
    expect(adapter.requiredCapabilityPrefix).toBe("git");
  });

  it("shows clean status on empty repo", async () => {
    const result = await exec("status");
    expect(result.success).toBe(true);
    expect(result.output?.trim()).toBe("");
  });

  it("shows status with untracked file", async () => {
    await fs.writeFile(path.join(tmpDir, "new.txt"), "hello");
    const result = await exec("status");
    expect(result.success).toBe(true);
    expect(result.output).toContain("new.txt");
  });

  it("adds and commits a file", async () => {
    await fs.writeFile(path.join(tmpDir, "file.txt"), "content");
    const addResult = await exec("add", { files: ["file.txt"] });
    expect(addResult.success).toBe(true);

    const commitResult = await exec("commit", { message: "initial" });
    expect(commitResult.success).toBe(true);

    const status = await exec("status");
    expect(status.output?.trim()).toBe("");
  });

  it("shows diff of staged changes", async () => {
    await fs.writeFile(path.join(tmpDir, "a.txt"), "line1");
    execFileSync("git", ["add", "."], { cwd: tmpDir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: tmpDir });

    await fs.writeFile(path.join(tmpDir, "a.txt"), "line1\nline2");
    execFileSync("git", ["add", "."], { cwd: tmpDir });

    const result = await exec("diff", { staged: true });
    expect(result.success).toBe(true);
    expect(result.output).toContain("+line2");
  });

  it("shows log", async () => {
    await fs.writeFile(path.join(tmpDir, "f.txt"), "x");
    execFileSync("git", ["add", "."], { cwd: tmpDir });
    execFileSync("git", ["commit", "-m", "first"], { cwd: tmpDir });

    const result = await exec("log", { count: 5 });
    expect(result.success).toBe(true);
    expect(result.output).toContain("first");
  });

  it("returns error for unknown action", async () => {
    const result = await exec("foobar");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown git action");
  });

  describe("validate", () => {
    it("returns true for valid params", () => {
      expect(adapter.validate({ action: "status" })).toBe(true);
    });

    it("returns false for missing action", () => {
      expect(adapter.validate({})).toBe(false);
    });
  });

  describe("estimateCapabilities", () => {
    it("returns git.read for status", () => {
      expect(adapter.estimateCapabilities({ action: "status" })).toEqual(["git.read:*"]);
    });

    it("returns git.write for commit", () => {
      expect(adapter.estimateCapabilities({ action: "commit" })).toEqual(["git.write:*"]);
    });
  });
});
