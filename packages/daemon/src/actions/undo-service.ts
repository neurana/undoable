import { UndoEngine, type FileBackup } from "@undoable/core";
import os from "node:os";
import path from "node:path";
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
  private undoneActions = new Set<string>();

  constructor(actionLog: ActionLog) {
    this.engine = new UndoEngine();
    this.actionLog = actionLog;
  }

  private resolveFilePath(input: string): string {
    const raw = input.trim();
    const home = os.homedir();
    if (raw === "~") return home;
    if (raw.startsWith("~/")) return path.join(home, raw.slice(2));
    if (path.isAbsolute(raw)) return raw;
    return path.resolve(home, raw);
  }

  async undoAction(actionId: string): Promise<UndoResult> {
    const resolved = this.resolveAction(actionId);
    if (!resolved) {
      return { actionId, toolName: "unknown", success: false, error: "Action not found" };
    }
    const action = resolved.action;
    const resolvedId = resolved.id;
    const corrected = resolved.corrected;
    if (this.undoneActions.has(resolvedId)) {
      return {
        actionId: resolvedId,
        toolName: action.toolName,
        success: false,
        error: "Action already undone. Use redo_one/redo_last to reapply it.",
      };
    }
    if (!action.undoable || !action.undoData) {
      return { actionId: resolvedId, toolName: action.toolName, success: false, error: "Action is not undoable" };
    }
    if (action.error) {
      return { actionId: resolvedId, toolName: action.toolName, success: false, error: "Action failed, nothing to undo" };
    }

    const undo = action.undoData;
    let result: UndoResult;
    if (undo.type === "file") {
      result = await this.undoFileAction(action, undo);
    } else if (undo.type === "exec") {
      result = this.undoExecAction(action, undo);
    } else {
      const exhaustive: never = undo;
      result = {
        actionId: resolvedId,
        toolName: action.toolName,
        success: false,
        error: `Unsupported undo type: ${(exhaustive as { type: string }).type}`,
      };
    }

    if (result.success) {
      this.undoneActions.add(resolvedId);
      if (corrected) {
        result.note = result.note
          ? `${result.note} (matched action id: ${resolvedId})`
          : `Matched action id: ${resolvedId}`;
      }
    }
    return result;
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
    const actions = this.listUndoable(runId);
    const toUndo = actions.slice(-n).reverse();
    const results: UndoResult[] = [];
    for (const action of toUndo) {
      results.push(await this.undoAction(action.id));
    }
    return results;
  }

  async undoAll(runId?: string): Promise<UndoResult[]> {
    const actions = this.listUndoable(runId);
    const reversed = [...actions].reverse();
    const results: UndoResult[] = [];
    for (const action of reversed) {
      results.push(await this.undoAction(action.id));
    }
    return results;
  }

  listUndoable(runId?: string): ActionRecord[] {
    return this.actionLog
      .undoableActions(runId)
      .filter((action) => !this.undoneActions.has(action.id));
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
    const resolved = this.resolveAction(actionId);
    if (!resolved) {
      return { actionId, toolName: "unknown", success: false, error: "Action not found" };
    }
    const action = resolved.action;
    const resolvedId = resolved.id;
    const corrected = resolved.corrected;
    const redo = this.redoSnapshots.get(actionId);
    if (!redo) {
      const resolvedRedo = this.redoSnapshots.get(resolvedId);
      if (!resolvedRedo) {
        return { actionId: resolvedId, toolName: action.toolName, success: false, error: "Action is not available for redo" };
      }
      return this.applyRedo(action, resolvedId, resolvedRedo, corrected);
    }
    return this.applyRedo(action, actionId, redo, corrected);
  }

  private async applyRedo(
    action: ActionRecord,
    actionId: string,
    redo: FileUndoData,
    corrected = false,
  ): Promise<UndoResult> {
    if (redo.type !== "file") {
      return { actionId, toolName: action.toolName, success: false, error: `Unsupported redo type: ${redo.type}` };
    }
    const resolvedPath = this.resolveFilePath(redo.path);

    const restore: FileBackup = {
      path: resolvedPath,
      content: redo.previousContent,
      contentBase64: redo.previousContentBase64,
      existed: redo.previousExisted,
    };
    const result = await this.engine.undoWithFileRestore([restore]);
    if (result.success) {
      this.redoSnapshots.delete(actionId);
      this.removeFromRedoStack(actionId);
      this.undoneActions.delete(actionId);
    }
    const note = corrected ? `Matched action id: ${actionId}` : undefined;
    return {
      actionId: action.id,
      toolName: action.toolName,
      success: result.success,
      error: result.error,
      note,
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
    const resolvedPath = this.resolveFilePath(undo.path);
    const beforeUndo = await this.engine.backupFile(resolvedPath);
    const backup: FileBackup = {
      path: resolvedPath,
      content: undo.previousContent,
      contentBase64: undo.previousContentBase64,
      existed: undo.previousExisted,
    };

    const result = await this.engine.undoWithFileRestore([backup]);
    if (result.success) {
      this.redoSnapshots.set(action.id, {
        type: "file",
        path: resolvedPath,
        previousContent: beforeUndo.content,
        previousContentBase64: beforeUndo.contentBase64,
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

  private resolveAction(actionId: string): { action: ActionRecord; id: string; corrected: boolean } | null {
    const normalized = actionId.trim();
    if (!normalized) return null;
    const exact = this.actionLog.getById(normalized);
    if (exact) {
      return { action: exact, id: exact.id, corrected: false };
    }

    const candidates = this.actionLog
      .list()
      .filter((record) => record.id.startsWith(normalized) || normalized.startsWith(record.id));
    if (candidates.length !== 1) return null;
    const matched = candidates[0]!;
    return { action: matched, id: matched.id, corrected: true };
  }
}
