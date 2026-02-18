export type ActionCategory = "read" | "mutate" | "exec" | "network" | "system";

export type ApprovalMode = "off" | "mutate" | "always";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "auto-approved";

export type ActionRecord = {
  id: string;
  runId?: string;
  toolName: string;
  category: ActionCategory;
  args: Record<string, unknown>;
  approval: ApprovalStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  result?: unknown;
  error?: string;
  undoable: boolean;
  undoData?: UndoData;
};

export type UndoData =
  | FileUndoData
  | ExecUndoData;

export type FileUndoData = {
  type: "file";
  path: string;
  previousContent: string | null;
  previousContentBase64?: string | null;
  previousExisted: boolean;
};

export type ExecUndoData = {
  type: "exec";
  command: string;
  cwd?: string;
  reverseCommand?: string;
  canReverse: boolean;
};

export type ToolCategoryMap = Record<string, ActionCategory>;

export const TOOL_CATEGORIES: ToolCategoryMap = {
  read_file: "read",
  list_dir: "read",
  find_files: "read",
  grep: "read",
  codebase_search: "read",
  project_info: "read",
  file_info: "read",
  system_info: "system",

  write_file: "mutate",
  edit_file: "mutate",

  exec: "exec",
  process: "exec",

  web_fetch: "network",
  browse_page: "network",
  browser: "network",

  connect: "network",
  nodes: "system",

  list_runs: "read",
  create_run: "mutate",
  list_jobs: "read",
  create_job: "mutate",
  delete_job: "mutate",
  toggle_job: "mutate",
  run_job: "exec",
  scheduler_status: "read",

  skills_list: "read",
  skills_search: "network",
  skills_discover: "network",
  skills_install: "mutate",
  skills_installed: "read",
  skills_check_updates: "network",
  skills_update: "mutate",
  skills_remove: "mutate",
  skills_toggle: "mutate",
};

export function getToolCategory(toolName: string): ActionCategory {
  return TOOL_CATEGORIES[toolName] ?? "system";
}

export function requiresApproval(toolName: string, mode: ApprovalMode): boolean {
  if (mode === "off") return false;
  if (mode === "always") return true;
  const category = getToolCategory(toolName);
  return category === "mutate" || category === "exec";
}

export function isUndoableTool(toolName: string): boolean {
  return toolName === "write_file" || toolName === "edit_file" || toolName === "exec" || toolName === "bash" || toolName === "shell";
}
