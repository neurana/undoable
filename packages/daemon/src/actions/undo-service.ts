import { UndoEngine, type FileBackup } from "@undoable/core";
import type { ActionLog } from "./action-log.js";
import type { ActionRecord, FileUndoData } from "./types.js";

export type UndoResult = {
  actionId: string;
  toolName: string;
  success: boolean;
  error?: string;
};

export class UndoService {
  private engine: UndoEngine;
  private actionLog: ActionLog;

  constructor(actionLog: ActionLog) {
    this.engine = new UndoEngine();
    this.actionLog = actionLog;
  }

  async undoAction(actionId: string): Promise<UndoResult> {
    const action = this.actionLog.getById(actionId);
    if (!action) {
      return { actionId, toolName: "unknown", success: false, error: "Action not found" };
    }
    if (!action.undoable || !action.undoData) {
      return { actionId, toolName: action.toolName, success: false, error: "Action is not undoable" };
    }
    if (action.error) {
      return { actionId, toolName: action.toolName, success: false, error: "Action failed, nothing to undo" };
    }

    const undo = action.undoData;
    if (undo.type === "file") {
      return this.undoFileAction(action, undo);
    }

    return { actionId, toolName: action.toolName, success: false, error: `Unsupported undo type: ${undo.type}` };
  }

  async undoLastN(n: number, runId?: string): Promise<UndoResult[]> {
    const actions = this.actionLog.undoableActions(runId);
    const toUndo = actions.slice(-n).reverse();
    const results: UndoResult[] = [];
    for (const action of toUndo) {
      results.push(await this.undoAction(action.id));
    }
    return results;
  }

  async undoAll(runId?: string): Promise<UndoResult[]> {
    const actions = this.actionLog.undoableActions(runId);
    const reversed = [...actions].reverse();
    const results: UndoResult[] = [];
    for (const action of reversed) {
      results.push(await this.undoAction(action.id));
    }
    return results;
  }

  listUndoable(runId?: string): ActionRecord[] {
    return this.actionLog.undoableActions(runId);
  }

  private async undoFileAction(action: ActionRecord, undo: FileUndoData): Promise<UndoResult> {
    const backup: FileBackup = {
      path: undo.path,
      content: undo.previousContent,
      existed: undo.previousExisted,
    };

    const result = await this.engine.undoWithFileRestore([backup]);
    return {
      actionId: action.id,
      toolName: action.toolName,
      success: result.success,
      error: result.error,
    };
  }
}
