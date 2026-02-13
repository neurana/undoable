import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ActionLog } from "./action-log.js";
import { UndoService } from "./undo-service.js";

describe("UndoService", () => {
  let actionLog: ActionLog;
  let undoService: UndoService;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-undo-svc-"));
    actionLog = new ActionLog(path.join(tmpDir, "actions"));
    undoService = new UndoService(actionLog);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("undoes a file write (new file)", async () => {
    const filePath = path.join(tmpDir, "new.txt");

    const action = await actionLog.record({
      toolName: "write_file",
      category: "mutate",
      args: { path: filePath },
      approval: "auto-approved",
      undoable: true,
      undoData: { type: "file", path: filePath, previousContent: null, previousExisted: false },
    });
    await fs.writeFile(filePath, "created by AI");
    await actionLog.complete(action.id, { written: true });

    const result = await undoService.undoAction(action.id);
    expect(result.success).toBe(true);

    try {
      await fs.access(filePath);
      expect.fail("File should have been deleted");
    } catch { }
  });

  it("undoes a file edit (restore previous content)", async () => {
    const filePath = path.join(tmpDir, "existing.txt");
    await fs.writeFile(filePath, "original content");

    const action = await actionLog.record({
      toolName: "edit_file",
      category: "mutate",
      args: { path: filePath },
      approval: "auto-approved",
      undoable: true,
      undoData: { type: "file", path: filePath, previousContent: "original content", previousExisted: true },
    });
    await fs.writeFile(filePath, "modified content");
    await actionLog.complete(action.id, { edited: true });

    const result = await undoService.undoAction(action.id);
    expect(result.success).toBe(true);

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("original content");
  });

  it("returns error for unknown action", async () => {
    const result = await undoService.undoAction("nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error for non-undoable action", async () => {
    const action = await actionLog.record({
      toolName: "read_file",
      category: "read",
      args: {},
      approval: "auto-approved",
      undoable: false,
    });
    await actionLog.complete(action.id, { content: "x" });

    const result = await undoService.undoAction(action.id);
    expect(result.success).toBe(false);
    expect(result.error).toContain("not undoable");
  });

  it("undoLastN undoes the N most recent undoable actions", async () => {
    const f1 = path.join(tmpDir, "f1.txt");
    const f2 = path.join(tmpDir, "f2.txt");
    await fs.writeFile(f1, "orig1");
    await fs.writeFile(f2, "orig2");

    const a1 = await actionLog.record({
      toolName: "edit_file",
      category: "mutate",
      args: { path: f1 },
      approval: "auto-approved",
      undoable: true,
      undoData: { type: "file", path: f1, previousContent: "orig1", previousExisted: true },
    });
    await fs.writeFile(f1, "changed1");
    await actionLog.complete(a1.id, { edited: true });

    const a2 = await actionLog.record({
      toolName: "edit_file",
      category: "mutate",
      args: { path: f2 },
      approval: "auto-approved",
      undoable: true,
      undoData: { type: "file", path: f2, previousContent: "orig2", previousExisted: true },
    });
    await fs.writeFile(f2, "changed2");
    await actionLog.complete(a2.id, { edited: true });

    const results = await undoService.undoLastN(2);
    expect(results.length).toBe(2);
    expect(results.every((r) => r.success)).toBe(true);

    expect(await fs.readFile(f1, "utf-8")).toBe("orig1");
    expect(await fs.readFile(f2, "utf-8")).toBe("orig2");
  });

  it("undoAll undoes everything", async () => {
    const f1 = path.join(tmpDir, "all1.txt");
    await fs.writeFile(f1, "before");

    const a = await actionLog.record({
      toolName: "write_file",
      category: "mutate",
      args: { path: f1 },
      approval: "auto-approved",
      undoable: true,
      undoData: { type: "file", path: f1, previousContent: "before", previousExisted: true },
    });
    await fs.writeFile(f1, "after");
    await actionLog.complete(a.id, { written: true });

    const results = await undoService.undoAll();
    expect(results.length).toBe(1);
    expect(results[0]!.success).toBe(true);
    expect(await fs.readFile(f1, "utf-8")).toBe("before");
  });

  it("listUndoable returns only completed undoable actions", async () => {
    const a1 = await actionLog.record({
      toolName: "write_file",
      category: "mutate",
      args: {},
      approval: "auto-approved",
      undoable: true,
      undoData: { type: "file", path: "/tmp/x", previousContent: null, previousExisted: false },
    });
    await actionLog.complete(a1.id, { ok: true });

    await actionLog.record({
      toolName: "read_file",
      category: "read",
      args: {},
      approval: "auto-approved",
      undoable: false,
    });

    expect(undoService.listUndoable().length).toBe(1);
  });
});
