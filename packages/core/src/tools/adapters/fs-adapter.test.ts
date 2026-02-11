import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FsAdapter } from "./fs-adapter.js";

let adapter: FsAdapter;
let tmpDir: string;

beforeEach(async () => {
  adapter = new FsAdapter();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-fs-test-"));
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

describe("FsAdapter", () => {
  it("has correct id and prefix", () => {
    expect(adapter.id).toBe("fs");
    expect(adapter.requiredCapabilityPrefix).toBe("fs");
  });

  describe("write + read", () => {
    it("writes and reads a file", async () => {
      const writeResult = await exec("write", { path: "test.txt", content: "hello" });
      expect(writeResult.success).toBe(true);

      const readResult = await exec("read", { path: "test.txt" });
      expect(readResult.success).toBe(true);
      expect(readResult.output).toBe("hello");
    });

    it("creates parent directories on write", async () => {
      const result = await exec("write", { path: "a/b/c.txt", content: "deep" });
      expect(result.success).toBe(true);

      const readResult = await exec("read", { path: "a/b/c.txt" });
      expect(readResult.output).toBe("deep");
    });
  });

  describe("read", () => {
    it("fails for non-existent file", async () => {
      const result = await exec("read", { path: "nope.txt" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Read failed");
    });
  });

  describe("delete", () => {
    it("deletes a file", async () => {
      await fs.writeFile(path.join(tmpDir, "del.txt"), "bye");
      const result = await exec("delete", { path: "del.txt" });
      expect(result.success).toBe(true);

      const exists = await exec("exists", { path: "del.txt" });
      expect(exists.output).toBe("false");
    });

    it("deletes a directory recursively", async () => {
      await fs.mkdir(path.join(tmpDir, "dir/sub"), { recursive: true });
      await fs.writeFile(path.join(tmpDir, "dir/sub/f.txt"), "x");
      const result = await exec("delete", { path: "dir" });
      expect(result.success).toBe(true);
    });

    it("fails for non-existent path", async () => {
      const result = await exec("delete", { path: "nope" });
      expect(result.success).toBe(false);
    });
  });

  describe("move", () => {
    it("moves a file", async () => {
      await fs.writeFile(path.join(tmpDir, "src.txt"), "data");
      const result = await exec("move", { path: "src.txt", destination: "dst.txt" });
      expect(result.success).toBe(true);

      const exists = await exec("exists", { path: "dst.txt" });
      expect(exists.output).toBe("true");
      const old = await exec("exists", { path: "src.txt" });
      expect(old.output).toBe("false");
    });
  });

  describe("mkdir", () => {
    it("creates nested directories", async () => {
      const result = await exec("mkdir", { path: "x/y/z" });
      expect(result.success).toBe(true);

      const exists = await exec("exists", { path: "x/y/z" });
      expect(exists.output).toBe("true");
    });
  });

  describe("list", () => {
    it("lists directory contents", async () => {
      await fs.writeFile(path.join(tmpDir, "a.txt"), "");
      await fs.mkdir(path.join(tmpDir, "subdir"));
      const result = await exec("list", { path: "." });
      expect(result.success).toBe(true);
      expect(result.output).toContain("f a.txt");
      expect(result.output).toContain("d subdir");
    });

    it("fails for non-existent directory", async () => {
      const result = await exec("list", { path: "nope" });
      expect(result.success).toBe(false);
    });
  });

  describe("exists", () => {
    it("returns true for existing file", async () => {
      await fs.writeFile(path.join(tmpDir, "e.txt"), "");
      const result = await exec("exists", { path: "e.txt" });
      expect(result.output).toBe("true");
    });

    it("returns false for missing file", async () => {
      const result = await exec("exists", { path: "nope.txt" });
      expect(result.output).toBe("false");
    });
  });

  describe("path traversal", () => {
    it("denies path traversal", async () => {
      const result = await exec("read", { path: "../../etc/passwd" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Path traversal denied");
    });
  });

  describe("missing path", () => {
    it("returns error when path is missing", async () => {
      const result = await adapter.execute({
        runId: "r1",
        stepId: "s1",
        params: { action: "read" },
        workingDir: tmpDir,
        capabilities: [],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("path is required");
    });
  });

  describe("unknown action", () => {
    it("returns error for unknown action", async () => {
      const result = await exec("foobar", { path: "any.txt" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown fs action");
    });
  });

  describe("validate", () => {
    it("returns true for valid params", () => {
      expect(adapter.validate({ action: "read", path: "/foo" })).toBe(true);
    });

    it("returns false for missing action", () => {
      expect(adapter.validate({ path: "/foo" })).toBe(false);
    });

    it("returns false for missing path", () => {
      expect(adapter.validate({ action: "read" })).toBe(false);
    });
  });

  describe("estimateCapabilities", () => {
    it("returns fs.read for read action", () => {
      expect(adapter.estimateCapabilities({ action: "read", path: "/foo" })).toEqual(["fs.read:/foo"]);
    });

    it("returns fs.write for write action", () => {
      expect(adapter.estimateCapabilities({ action: "write", path: "/foo" })).toEqual(["fs.write:/foo"]);
    });

    it("returns fs.read for list action", () => {
      expect(adapter.estimateCapabilities({ action: "list", path: "/dir" })).toEqual(["fs.read:/dir"]);
    });
  });
});
