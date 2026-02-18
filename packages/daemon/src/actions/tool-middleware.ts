import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentTool } from "../tools/types.js";
import type { ActionLog } from "./action-log.js";
import type { ApprovalGate } from "./approval-gate.js";
import type { FileUndoData, ExecUndoData, UndoData } from "./types.js";
import { getToolCategory, isUndoableTool } from "./types.js";
import { getReversalCommand } from "./command-reversal.js";

export type ToolMiddlewareOptions = {
  actionLog: ActionLog;
  approvalGate: ApprovalGate;
  runId?: string;
};

const HOME = os.homedir();

function resolveFilePath(input: string): string {
  const raw = input.trim();
  if (raw === "~") return HOME;
  if (raw.startsWith("~/")) return path.join(HOME, raw.slice(2));
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(HOME, raw);
}

function captureFileState(args: Record<string, unknown>): FileUndoData | undefined {
  const filePath = args.path as string | undefined;
  if (!filePath) return undefined;
  const resolvedPath = resolveFilePath(filePath);

  try {
    const buffer = fs.readFileSync(resolvedPath);
    return {
      type: "file",
      path: resolvedPath,
      previousContent: buffer.toString("utf-8"),
      previousContentBase64: buffer.toString("base64"),
      previousExisted: true,
    };
  } catch {
    return {
      type: "file",
      path: resolvedPath,
      previousContent: null,
      previousContentBase64: null,
      previousExisted: false,
    };
  }
}

function captureExecState(args: Record<string, unknown>): ExecUndoData | undefined {
  const command = (args.command ?? args.cmd ?? args.script) as string | undefined;
  if (!command) return undefined;
  const cwd = (args.cwd ?? args.workingDirectory ?? args.dir) as string | undefined;
  const reversal = getReversalCommand(command, cwd);
  return {
    type: "exec",
    command,
    cwd,
    reverseCommand: reversal.reverseCommand,
    canReverse: reversal.canReverse,
  };
}

function captureUndoData(toolName: string, args: Record<string, unknown>): UndoData | undefined {
  if (toolName === "write_file" || toolName === "edit_file") {
    return captureFileState(args);
  }
  if (toolName === "exec" || toolName === "bash" || toolName === "shell") {
    return captureExecState(args);
  }
  return undefined;
}

export function wrapToolWithMiddleware(tool: AgentTool, opts: ToolMiddlewareOptions): AgentTool {
  const { actionLog, approvalGate, runId } = opts;

  return {
    name: tool.name,
    definition: tool.definition,
    execute: async (args: Record<string, unknown>) => {
      const category = getToolCategory(tool.name);
      const undoable = isUndoableTool(tool.name);

      const approvalStatus = await approvalGate.check(tool.name, args);
      if (approvalStatus === "rejected") {
        const action = await actionLog.record({
          runId,
          toolName: tool.name,
          category,
          args,
          approval: "rejected",
          undoable: false,
        });
        await actionLog.complete(action.id, null, "Action rejected by user");
        return {
          error: "Action requires approval. Rejected by user.",
          toolName: tool.name,
          approvalRequired: true,
        };
      }

      let undoData: UndoData | undefined;
      if (undoable) {
        undoData = captureUndoData(tool.name, args);
      }

      const action = await actionLog.record({
        runId,
        toolName: tool.name,
        category,
        args,
        approval: approvalStatus,
        undoable: undoable && undoData !== undefined,
        undoData,
      });

      try {
        const result = await tool.execute(args);
        await actionLog.complete(action.id, result);
        return result;
      } catch (err) {
        await actionLog.complete(action.id, null, (err as Error).message);
        throw err;
      }
    },
  };
}

export function wrapAllTools(tools: AgentTool[], opts: ToolMiddlewareOptions): AgentTool[] {
  return tools.map((tool) => wrapToolWithMiddleware(tool, opts));
}
