import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { gatherContext, gatherRepoStructure, readSpecificFiles } from "./context-gatherer.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "undoable-ctx-test-"));
  fs.writeFileSync(path.join(tmpDir, "index.ts"), "export const x = 1;");
  fs.mkdirSync(path.join(tmpDir, "src"));
  fs.writeFileSync(path.join(tmpDir, "src/app.ts"), "console.log('hi');");
  fs.writeFileSync(path.join(tmpDir, "package.json"), '{"name":"test"}');
  fs.mkdirSync(path.join(tmpDir, "node_modules"));
  fs.writeFileSync(path.join(tmpDir, "node_modules/pkg.js"), "skip");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("gatherRepoStructure", () => {
  it("lists files and directories", () => {
    const structure = gatherRepoStructure(tmpDir);
    expect(structure).toContain("index.ts");
    expect(structure).toContain("src/");
    expect(structure).toContain("package.json");
  });

  it("excludes node_modules", () => {
    const structure = gatherRepoStructure(tmpDir);
    const hasNodeModules = structure.some((s) => s.includes("node_modules"));
    expect(hasNodeModules).toBe(false);
  });

  it("respects max depth", () => {
    fs.mkdirSync(path.join(tmpDir, "a/b/c/d/e"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "a/b/c/d/e/deep.ts"), "deep");
    const shallow = gatherRepoStructure(tmpDir, 2);
    const hasDeep = shallow.some((s) => s.includes("deep.ts"));
    expect(hasDeep).toBe(false);
  });
});

describe("readSpecificFiles", () => {
  it("reads specified files", () => {
    const files = readSpecificFiles(tmpDir, ["index.ts", "src/app.ts"]);
    expect(files).toHaveLength(2);
    expect(files[0]!.content).toContain("export const x");
  });

  it("skips non-existent files", () => {
    const files = readSpecificFiles(tmpDir, ["nope.ts"]);
    expect(files).toHaveLength(0);
  });

  it("skips files exceeding max size", () => {
    const bigContent = "x".repeat(100);
    fs.writeFileSync(path.join(tmpDir, "big.ts"), bigContent);
    const files = readSpecificFiles(tmpDir, ["big.ts"], 50);
    expect(files).toHaveLength(0);
  });

  it("skips binary extensions", () => {
    fs.writeFileSync(path.join(tmpDir, "image.png"), "binary");
    const files = readSpecificFiles(tmpDir, ["image.png"]);
    expect(files).toHaveLength(0);
  });
});

describe("gatherContext", () => {
  it("gathers full context", () => {
    const ctx = gatherContext({
      workingDir: tmpDir,
      instruction: "fix bug",
      includeFiles: ["index.ts"],
      metadata: { lang: "ts" },
    });

    expect(ctx.instruction).toBe("fix bug");
    expect(ctx.repoStructure).toBeDefined();
    expect(ctx.repoStructure!.length).toBeGreaterThan(0);
    expect(ctx.files).toHaveLength(1);
    expect(ctx.metadata).toEqual({ lang: "ts" });
  });

  it("works without optional fields", () => {
    const ctx = gatherContext({ workingDir: tmpDir, instruction: "test" });
    expect(ctx.instruction).toBe("test");
    expect(ctx.repoStructure).toBeDefined();
    expect(ctx.files).toBeUndefined();
  });
});
