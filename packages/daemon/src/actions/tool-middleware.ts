import { execSync } from "node:child_process";
import type { AgentTool } from "../tools/types.js";
import type { ActionLog } from "./action-log.js";
import type { ApprovalGate } from "./approval-gate.js";
import type { FileUndoData } from "./types.js";
import { getToolCategory, isUndoableTool } from "./types.js";

export type ToolMiddlewareOptions = {
  actionLog: ActionLog;
  approvalGate: ApprovalGate;
  runId?: string;
};

function captureFileState(args: Record<string, unknown>): FileUndoData | undefined {
  const filePath = args.path as string | undefined;
  if (!filePath) return undefined;

  try {
    const content = execSync(`cat ${JSON.stringify(filePath)}`, {
      encoding: "utf-8",
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { type: "file", path: filePath, previousContent: content, previousExisted: true };
  } catch {
    return { type: "file", path: filePath, previousContent: null, previousExisted: false };
  }
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

      let undoData: FileUndoData | undefined;
      if (undoable) {
        undoData = captureFileState(args);
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
