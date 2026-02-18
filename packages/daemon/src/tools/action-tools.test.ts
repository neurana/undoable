import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createActionTools } from "./action-tools.js";
import { ActionLog } from "../actions/action-log.js";
import { ApprovalGate } from "../actions/approval-gate.js";
import { UndoService } from "../actions/undo-service.js";

describe("action-tools undo list", () => {
  let tmpDir: string;
  let actionLog: ActionLog;
  let undoTool: ReturnType<typeof createActionTools>[number];

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-action-tools-"));
    actionLog = new ActionLog(path.join(tmpDir, "actions"));
    const approvalGate = new ApprovalGate("off");
    const undoService = new UndoService(actionLog);
    const tools = createActionTools(actionLog, approvalGate, undoService);
    undoTool = tools.find((tool) => tool.name === "undo")!;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("hides internal control actions from nonUndoableRecent", async () => {
    const undoRecord = await actionLog.record({
      toolName: "undo",
      category: "mutate",
      args: { action: "list" },
      approval: "auto-approved",
      undoable: false,
    });
    await actionLog.complete(undoRecord.id, { ok: true });

    const actionsRecord = await actionLog.record({
      toolName: "actions",
      category: "read",
      args: { action: "list" },
      approval: "auto-approved",
      undoable: false,
    });
    await actionLog.complete(actionsRecord.id, { ok: true });

    const execRecord = await actionLog.record({
      toolName: "exec",
      category: "exec",
      args: { command: "mkdir -p ~/Desktop/undoable_drill" },
      approval: "auto-approved",
      undoable: false,
    });
    await actionLog.complete(execRecord.id, { exitCode: 0 });

    const result = await undoTool.execute({ action: "list" }) as {
      nonUndoableRecent: Array<{ tool: string }>;
    };
    expect(result.nonUndoableRecent.map((item) => item.tool)).toEqual(["exec"]);
  });
});
