import { describe, it, expect, beforeEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { ActionLog } from "./action-log.js";
import { ApprovalGate } from "./approval-gate.js";
import { wrapToolWithMiddleware } from "./tool-middleware.js";
import type { AgentTool } from "../tools/types.js";

function makeFakeTool(name: string, result: unknown): AgentTool {
  return {
    name,
    definition: { type: "function", function: { name, description: "", parameters: {} } },
    execute: async () => result,
  };
}

describe("wrapToolWithMiddleware", () => {
  let actionLog: ActionLog;
  let approvalGate: ApprovalGate;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-mw-test-"));
    actionLog = new ActionLog(path.join(tmpDir, "actions"));
    approvalGate = new ApprovalGate("off");
  });

  it("records read tool without approval", async () => {
    const tool = makeFakeTool("read_file", { content: "hello" });
    const wrapped = wrapToolWithMiddleware(tool, { actionLog, approvalGate });

    const result = await wrapped.execute({ path: "/tmp/test.txt" });
    expect(result).toEqual({ content: "hello" });
    expect(actionLog.count()).toBe(1);

    const record = actionLog.list()[0]!;
    expect(record.toolName).toBe("read_file");
    expect(record.approval).toBe("auto-approved");
    expect(record.undoable).toBe(false);
  });

  it("requires approval for skills_install even when approval mode is off", async () => {
    const tool = makeFakeTool("skills_install", { ok: true, installed: true });
    const wrapped = wrapToolWithMiddleware(tool, { actionLog, approvalGate });

    const resultPromise = wrapped.execute({
      reference: "vercel-labs/skills@find-skills",
      agents: ["codex"],
    });

    const pending = approvalGate.listPending();
    expect(pending.length).toBe(1);
    expect(pending[0]!.toolName).toBe("skills_install");
    approvalGate.resolve(pending[0]!.id, true);

    const result = await resultPromise;
    expect(result).toEqual({ ok: true, installed: true });

    const record = actionLog.list()[0]!;
    expect(record.approval).toBe("approved");
  });

  it("records write_file as undoable and captures before-state", async () => {
    const filePath = path.join(tmpDir, "target.txt");
    await fs.writeFile(filePath, "original");

    const tool = makeFakeTool("write_file", { written: true });
    const wrapped = wrapToolWithMiddleware(tool, { actionLog, approvalGate });

    await wrapped.execute({ path: filePath, content: "new content" });

    const record = actionLog.list()[0]!;
    expect(record.undoable).toBe(true);
    expect(record.undoData).toBeDefined();
    expect(record.undoData!.type).toBe("file");
    const fileUndo = record.undoData as {
      type: "file";
      previousContent: string;
      previousContentBase64?: string | null;
      previousExisted: boolean;
    };
    expect(fileUndo.previousContent).toBe("original");
    expect(fileUndo.previousContentBase64).toBe(Buffer.from("original", "utf-8").toString("base64"));
    expect(fileUndo.previousExisted).toBe(true);
  });

  it("captures non-existent file state for new write_file", async () => {
    const filePath = path.join(tmpDir, "does-not-exist.txt");

    const tool = makeFakeTool("write_file", { written: true });
    const wrapped = wrapToolWithMiddleware(tool, { actionLog, approvalGate });

    await wrapped.execute({ path: filePath, content: "new" });

    const record = actionLog.list()[0]!;
    expect(record.undoable).toBe(true);
    const fileUndo = record.undoData as { type: "file"; previousContent: string | null; previousExisted: boolean };
    expect(fileUndo.previousExisted).toBe(false);
    expect(fileUndo.previousContent).toBeNull();
  });

  it("normalizes ~/ paths before storing undo data", async () => {
    const tool = makeFakeTool("write_file", { written: true });
    const wrapped = wrapToolWithMiddleware(tool, { actionLog, approvalGate });

    await wrapped.execute({ path: "~/Desktop/undo-mw-test.txt", content: "x" });

    const record = actionLog.list()[0]!;
    const fileUndo = record.undoData as { type: "file"; path: string };
    expect(fileUndo.path).toBe(path.join(os.homedir(), "Desktop", "undo-mw-test.txt"));
  });

  it("blocks mutate tool when approval mode is mutate and rejected", async () => {
    approvalGate.setMode("mutate");

    const tool = makeFakeTool("write_file", { written: true });
    const wrapped = wrapToolWithMiddleware(tool, { actionLog, approvalGate });

    const checkPromise = wrapped.execute({ path: "/tmp/a.txt", content: "x" });

    const pending = approvalGate.listPending();
    expect(pending.length).toBe(1);
    approvalGate.resolve(pending[0]!.id, false);

    const result = await checkPromise;
    expect((result as Record<string, unknown>).error).toContain("Rejected");

    const record = actionLog.list()[0]!;
    expect(record.approval).toBe("rejected");
  });

  it("allows mutate tool when approved", async () => {
    approvalGate.setMode("mutate");

    const tool = makeFakeTool("write_file", { written: true });
    const wrapped = wrapToolWithMiddleware(tool, { actionLog, approvalGate });

    const resultPromise = wrapped.execute({ path: "/tmp/a.txt", content: "x" });

    const pending = approvalGate.listPending();
    approvalGate.resolve(pending[0]!.id, true);

    const result = await resultPromise;
    expect((result as Record<string, unknown>).written).toBe(true);
  });

  it("records error when tool throws", async () => {
    const tool: AgentTool = {
      name: "exec",
      definition: { type: "function", function: { name: "exec", description: "", parameters: {} } },
      execute: async () => { throw new Error("boom"); },
    };
    const wrapped = wrapToolWithMiddleware(tool, { actionLog, approvalGate });

    await expect(wrapped.execute({ command: "bad" })).rejects.toThrow("boom");

    const record = actionLog.list()[0]!;
    expect(record.error).toBe("boom");
  });

  it("marks non-reversible exec commands as not undoable", async () => {
    const tool = makeFakeTool("exec", { ok: true });
    const wrapped = wrapToolWithMiddleware(tool, { actionLog, approvalGate });

    await wrapped.execute({ command: "echo hello" });

    const record = actionLog.list()[0]!;
    expect(record.toolName).toBe("exec");
    expect(record.undoable).toBe(false);
    expect(record.undoData).toBeDefined();
    expect(record.undoData && record.undoData.type === "exec" ? record.undoData.canReverse : true).toBe(false);
  });

  it("marks reversible exec commands as undoable", async () => {
    const tool = makeFakeTool("exec", { ok: true });
    const wrapped = wrapToolWithMiddleware(tool, { actionLog, approvalGate });

    await wrapped.execute({ command: "mkdir tmp-example" });

    const record = actionLog.list()[0]!;
    expect(record.toolName).toBe("exec");
    expect(record.undoable).toBe(true);
    expect(record.undoData && record.undoData.type === "exec" ? record.undoData.canReverse : false).toBe(true);
  });

  it("passes runId to action records", async () => {
    const tool = makeFakeTool("read_file", { content: "x" });
    const wrapped = wrapToolWithMiddleware(tool, { actionLog, approvalGate, runId: "run-123" });

    await wrapped.execute({ path: "/tmp/a" });
    expect(actionLog.list()[0]!.runId).toBe("run-123");
  });
});
