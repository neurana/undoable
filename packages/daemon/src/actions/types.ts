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
  /* File / codebase */
  read_file: "read",
  list_dir: "read",
  find_files: "read",
  grep: "read",
  codebase_search: "read",
  write_file: "mutate",
  edit_file: "mutate",

  /* System / metadata */
  project_info: "read",
  file_info: "read",
  system_info: "system",

  /* Exec */
  exec: "exec",
  process: "exec",
  subagent_spawn: "exec",
  run_job: "exec",
  swarm_run_node: "exec",

  /* Web / browser */
  web_search: "network",
  web_fetch: "network",
  browse_page: "network",
  browser: "network",

  /* Connectors / channels */
  connect: "network",
  nodes: "system",
  telegram_actions: "mutate",
  discord_actions: "mutate",
  slack_actions: "mutate",
  whatsapp_actions: "mutate",

  /* Sessions */
  sessions_list: "read",
  sessions_history: "read",
  sessions_send: "mutate",
  sessions_spawn: "mutate",
  session_status: "read",

  /* Memory */
  memory_search: "read",
  memory_save: "mutate",
  memory_remove: "mutate",
  memory_sync: "mutate",

  /* Runs / jobs */
  list_runs: "read",
  create_run: "mutate",
  list_jobs: "read",
  create_job: "mutate",
  delete_job: "mutate",
  toggle_job: "mutate",
  scheduler_status: "read",

  /* Swarm */
  swarm_list_workflows: "read",
  swarm_get_workflow: "read",
  swarm_create_workflow: "mutate",
  swarm_update_workflow: "mutate",
  swarm_delete_workflow: "mutate",
  swarm_reconcile_jobs: "mutate",
  swarm_add_node: "mutate",
  swarm_update_node: "mutate",
  swarm_remove_node: "mutate",
  swarm_delete_node: "mutate",
  swarm_set_edges: "mutate",
  swarm_upsert_edge: "mutate",
  swarm_remove_edge: "mutate",
  swarm_list_node_runs: "read",

  /* Skills */
  skills_list: "read",
  skills_search: "network",
  skills_discover: "network",
  skills_install: "mutate",
  skills_installed: "read",
  skills_check_updates: "network",
  skills_update: "mutate",
  skills_remove: "mutate",
  skills_toggle: "mutate",

  /* Misc */
  actions: "read",
  undo: "mutate",
  canvas: "system",
  media: "network",
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
