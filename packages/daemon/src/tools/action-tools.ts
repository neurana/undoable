import type { AgentTool } from "./types.js";
import type { ActionLog } from "../actions/action-log.js";
import type { ApprovalGate } from "../actions/approval-gate.js";
import type { UndoService } from "../actions/undo-service.js";

export function createActionTools(
  actionLog: ActionLog,
  approvalGate: ApprovalGate,
  undoService: UndoService,
): AgentTool[] {
  return [createActionsTool(actionLog, approvalGate), createUndoTool(undoService)];
}

function createActionsTool(actionLog: ActionLog, approvalGate: ApprovalGate): AgentTool {
  return {
    name: "actions",
    definition: {
      type: "function",
      function: {
        name: "actions",
        description:
          "View action history and manage approvals. Every tool call is recorded with before/after state for undo support.",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["list", "detail", "pending", "approve", "reject", "approval_mode"],
              description: "Action to perform",
            },
            id: { type: "string", description: "Action or approval ID (for detail/approve/reject)" },
            toolName: { type: "string", description: "Filter by tool name (for list)" },
            category: { type: "string", description: "Filter by category: read|mutate|exec|network|system" },
            limit: { type: "number", description: "Max results (default: 20)" },
            mode: { type: "string", description: "Set approval mode: off|mutate|always (for approval_mode)" },
          },
          required: ["action"],
        },
      },
    },
    execute: async (args) => {
      const action = args.action as string;

      switch (action) {
        case "list": {
          const limit = (args.limit as number) ?? 20;
          const records = actionLog.list({
            toolName: args.toolName as string | undefined,
            category: args.category as "read" | "mutate" | "exec" | "network" | "system" | undefined,
          });
          const recent = records.slice(-limit);
          return {
            total: records.length,
            showing: recent.length,
            actions: recent.map((r) => ({
              id: r.id,
              tool: r.toolName,
              category: r.category,
              approval: r.approval,
              undoable: r.undoable,
              startedAt: r.startedAt,
              durationMs: r.durationMs,
              error: r.error ?? null,
            })),
          };
        }

        case "detail": {
          if (!args.id) return { error: "id is required" };
          const record = actionLog.getById(args.id as string);
          if (!record) return { error: "Action not found" };
          return record;
        }

        case "pending": {
          const pending = approvalGate.listPending();
          return {
            mode: approvalGate.getMode(),
            count: pending.length,
            approvals: pending.map((p) => ({
              id: p.id,
              tool: p.toolName,
              description: p.description,
              createdAt: p.createdAt,
            })),
          };
        }

        case "approve": {
          if (!args.id) return { error: "id is required" };
          const approved = approvalGate.resolve(args.id as string, true);
          return { approved, id: args.id };
        }

        case "reject": {
          if (!args.id) return { error: "id is required" };
          const rejected = approvalGate.resolve(args.id as string, false);
          return { rejected, id: args.id };
        }

        case "approval_mode": {
          if (args.mode) {
            const mode = args.mode as "off" | "mutate" | "always";
            approvalGate.setMode(mode);
          }
          return { mode: approvalGate.getMode() };
        }

        default:
          return { error: `Unknown action: ${action}` };
      }
    },
  };
}

function createUndoTool(undoService: UndoService): AgentTool {
  return {
    name: "undo",
    definition: {
      type: "function",
      function: {
        name: "undo",
        description:
          "Undo or redo previous actions. Restores files to their state before/after the AI modified them.",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["list", "one", "last", "all", "redo_one", "redo_last", "redo_all"],
              description: "list: show undoable/redoable actions. one/last/all: undo. redo_one/redo_last/redo_all: redo previously undone actions.",
            },
            id: { type: "string", description: "Action ID to undo (for action=one)" },
            count: { type: "number", description: "Number of recent actions to undo (for action=last, default: 1)" },
          },
          required: ["action"],
        },
      },
    },
    execute: async (args) => {
      const action = args.action as string;

      switch (action) {
        case "list": {
          const undoable = undoService.listUndoable();
          const redoable = undoService.listRedoable();
          return {
            undoableCount: undoable.length,
            redoableCount: redoable.length,
            undoable: undoable.map((r) => ({
              id: r.id,
              tool: r.toolName,
              args: r.args,
              startedAt: r.startedAt,
            })),
            redoable: redoable.map((r) => ({
              id: r.id,
              tool: r.toolName,
              args: r.args,
              startedAt: r.startedAt,
            })),
          };
        }

        case "one": {
          if (!args.id) return { error: "id is required" };
          const result = await undoService.undoAction(args.id as string);
          return result;
        }

        case "last": {
          const count = (args.count as number) ?? 1;
          const results = await undoService.undoLastN(count);
          return { undone: results.length, results };
        }

        case "all": {
          const results = await undoService.undoAll();
          return { undone: results.length, results };
        }

        case "redo_one": {
          if (!args.id) return { error: "id is required" };
          const result = await undoService.redoAction(args.id as string);
          return result;
        }

        case "redo_last": {
          const count = (args.count as number) ?? 1;
          const results = await undoService.redoLastN(count);
          return { redone: results.length, results };
        }

        case "redo_all": {
          const results = await undoService.redoAll();
          return { redone: results.length, results };
        }

        default:
          return { error: `Unknown action: ${action}` };
      }
    },
  };
}
