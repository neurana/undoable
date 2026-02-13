import * as fs from "node:fs/promises";
import * as path from "node:path";
import os from "node:os";
import { generateId, nowISO } from "@undoable/shared";
import type { ActionRecord, ActionCategory, ApprovalStatus, UndoData } from "./types.js";

const DEFAULT_DIR = path.join(os.homedir(), ".undoable", "actions");
const MAX_IN_MEMORY = 500;

export class ActionLog {
  private records: ActionRecord[] = [];
  private dir: string;
  private initialized = false;

  constructor(dir?: string) {
    this.dir = dir ?? DEFAULT_DIR;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.dir, { recursive: true });
    this.initialized = true;
  }

  async record(params: {
    runId?: string;
    toolName: string;
    category: ActionCategory;
    args: Record<string, unknown>;
    approval: ApprovalStatus;
    undoable: boolean;
    undoData?: UndoData;
  }): Promise<ActionRecord> {
    await this.init();
    const action: ActionRecord = {
      id: generateId(),
      runId: params.runId,
      toolName: params.toolName,
      category: params.category,
      args: this.sanitizeArgs(params.args),
      approval: params.approval,
      startedAt: nowISO(),
      undoable: params.undoable,
      undoData: params.undoData,
    };
    this.records.push(action);
    if (this.records.length > MAX_IN_MEMORY) {
      this.records = this.records.slice(-MAX_IN_MEMORY);
    }
    return action;
  }

  async complete(actionId: string, result: unknown, error?: string): Promise<ActionRecord | null> {
    const action = this.records.find((r) => r.id === actionId);
    if (!action) return null;
    action.completedAt = nowISO();
    action.durationMs = new Date(action.completedAt).getTime() - new Date(action.startedAt).getTime();
    action.result = this.summarizeResult(result);
    if (error) action.error = error;
    await this.persistAction(action);
    return action;
  }

  list(filters?: { runId?: string; toolName?: string; category?: ActionCategory; undoable?: boolean }): ActionRecord[] {
    if (!filters) return [...this.records];
    return this.records.filter((r) => {
      if (filters.runId && r.runId !== filters.runId) return false;
      if (filters.toolName && r.toolName !== filters.toolName) return false;
      if (filters.category && r.category !== filters.category) return false;
      if (filters.undoable !== undefined && r.undoable !== filters.undoable) return false;
      return true;
    });
  }

  getById(id: string): ActionRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  undoableActions(runId?: string): ActionRecord[] {
    return this.records.filter(
      (r) => r.undoable && r.undoData && r.completedAt && !r.error && (!runId || r.runId === runId),
    );
  }

  count(): number {
    return this.records.length;
  }

  clear(): void {
    this.records = [];
  }

  private async persistAction(action: ActionRecord): Promise<void> {
    try {
      await this.init();
      const date = action.startedAt.slice(0, 10);
      const logFile = path.join(this.dir, `${date}.jsonl`);
      const line = JSON.stringify(action) + "\n";
      await fs.appendFile(logFile, line, "utf-8");
    } catch { }
  }

  private sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (key === "content" && typeof value === "string" && value.length > 2000) {
        sanitized[key] = value.slice(0, 2000) + `... (${value.length} chars)`;
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private summarizeResult(result: unknown): unknown {
    if (result === null || result === undefined) return null;
    const json = JSON.stringify(result);
    if (json.length > 2000) {
      if (typeof result === "object" && result !== null) {
        const keys = Object.keys(result as Record<string, unknown>);
        return { _summary: true, keys, truncatedLength: json.length };
      }
      return { _summary: true, truncatedLength: json.length };
    }
    return result;
  }
}
