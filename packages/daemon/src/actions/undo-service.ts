import { UndoEngine, type FileBackup } from "@undoable/core";
import type { ActionLog } from "./action-log.js";
import type { ActionRecord, FileUndoData, ExecUndoData } from "./types.js";
import { executeReversal } from "./command-reversal.js";

export type UndoResult = {
  actionId: string;
  toolName: string;
  success: boolean;
  error?: string;
  note?: string;
};

export class UndoService {
  private engine: UndoEngine;
  private actionLog: ActionLog;
  private redoSnapshots = new Map<string, FileUndoData>();
  private redoStack: string[] = [];

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
    if (undo.type === "exec") {
      return this.undoExecAction(action, undo);
    }

    const exhaustive: never = undo;
    return { actionId, toolName: action.toolName, success: false, error: `Unsupported undo type: ${(exhaustive as { type: string }).type}` };
  }

  private undoExecAction(action: ActionRecord, undo: ExecUndoData): UndoResult {
    const cmdPreview = undo.command.length > 50 ? `${undo.command.slice(0, 50)}...` : undo.command;
    if (!undo.canReverse || !undo.reverseCommand) {
      return {
        actionId: action.id,
        toolName: action.toolName,
        success: false,
        error: `Cannot auto-reverse: "${cmdPreview}"`,
      };
    }
    const result = executeReversal(undo.reverseCommand, undo.cwd);
    if (result.success) {
      return {
        actionId: action.id,
        toolName: action.toolName,
        success: true,
        note: `Reversed "${cmdPreview}" with "${undo.reverseCommand}"`,
      };
    }
    return {
      actionId: action.id,
      toolName: action.toolName,
      success: false,
      error: `Reversal failed: ${result.error}`,
    };
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

  listRedoable(runId?: string): ActionRecord[] {
    const records: ActionRecord[] = [];
    for (const actionId of this.redoStack) {
      const record = this.actionLog.getById(actionId);
      if (!record) continue;
      if (runId && record.runId !== runId) continue;
      records.push(record);
    }
    return records;
  }

  async redoAction(actionId: string): Promise<UndoResult> {
    const action = this.actionLog.getById(actionId);
    if (!action) {
      return { actionId, toolName: "unknown", success: false, error: "Action not found" };
    }
    const redo = this.redoSnapshots.get(actionId);
    if (!redo) {
      return { actionId, toolName: action.toolName, success: false, error: "Action is not available for redo" };
    }

    if (redo.type !== "file") {
      return { actionId, toolName: action.toolName, success: false, error: `Unsupported redo type: ${redo.type}` };
    }

    const restore: FileBackup = {
      path: redo.path,
      content: redo.previousContent,
      existed: redo.previousExisted,
    };
    const result = await this.engine.undoWithFileRestore([restore]);
    if (result.success) {
      this.redoSnapshots.delete(actionId);
      this.removeFromRedoStack(actionId);
    }
    return {
      actionId: action.id,
      toolName: action.toolName,
      success: result.success,
      error: result.error,
    };
  }

  async redoLastN(n: number, runId?: string): Promise<UndoResult[]> {
    const queued = this.getRedoCandidates(runId).slice(-n).reverse();
    const results: UndoResult[] = [];
    for (const actionId of queued) {
      results.push(await this.redoAction(actionId));
    }
    return results;
  }

  async redoAll(runId?: string): Promise<UndoResult[]> {
    const queued = this.getRedoCandidates(runId).reverse();
    const results: UndoResult[] = [];
    for (const actionId of queued) {
      results.push(await this.redoAction(actionId));
    }
    return results;
  }

  private async undoFileAction(action: ActionRecord, undo: FileUndoData): Promise<UndoResult> {
    const beforeUndo = await this.engine.backupFile(undo.path);
    const backup: FileBackup = {
      path: undo.path,
      content: undo.previousContent,
      existed: undo.previousExisted,
    };

    const result = await this.engine.undoWithFileRestore([backup]);
    if (result.success) {
      this.redoSnapshots.set(action.id, {
        type: "file",
        path: undo.path,
        previousContent: beforeUndo.content,
        previousExisted: beforeUndo.existed,
      });
      this.removeFromRedoStack(action.id);
      this.redoStack.push(action.id);
    }
    return {
      actionId: action.id,
      toolName: action.toolName,
      success: result.success,
      error: result.error,
    };
  }

  private removeFromRedoStack(actionId: string) {
    const idx = this.redoStack.lastIndexOf(actionId);
    if (idx >= 0) this.redoStack.splice(idx, 1);
  }

  private getRedoCandidates(runId?: string): string[] {
    if (!runId) return [...this.redoStack];
    return this.redoStack.filter((id) => this.actionLog.getById(id)?.runId === runId);
  }
}
