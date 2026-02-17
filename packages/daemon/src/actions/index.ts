export type {
  ActionRecord,
  ActionCategory,
  ApprovalMode,
  ApprovalStatus,
  UndoData,
  FileUndoData,
  ExecUndoData,
} from "./types.js";
export { getToolCategory, requiresApproval, isUndoableTool, TOOL_CATEGORIES } from "./types.js";
export { ActionLog } from "./action-log.js";
export { ApprovalGate, type PendingApproval } from "./approval-gate.js";
export { wrapToolWithMiddleware, wrapAllTools, type ToolMiddlewareOptions } from "./tool-middleware.js";
export { UndoService, type UndoResult } from "./undo-service.js";
export { type RunMode, type RunModeConfig, resolveRunMode, shouldAutoApprove } from "./run-mode.js";
export { getReversalCommand, executeReversal, type ReversalResult } from "./command-reversal.js";
