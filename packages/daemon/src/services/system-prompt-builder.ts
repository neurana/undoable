import os from "node:os";
import type { ToolDefinition } from "../tools/types.js";

export type ContextFile = {
  path: string;
  content: string;
};

export type SystemPromptParams = {
  agentName?: string;
  agentInstructions?: string;
  skillsPrompt?: string;
  toolDefinitions?: ToolDefinition[];
  contextFiles?: ContextFile[];
  workspaceDir?: string;
  runtime?: {
    model?: string;
    provider?: string;
    os?: string;
    arch?: string;
    node?: string;
  };
};

function buildIdentitySection(agentName?: string): string[] {
  const name = agentName?.trim() || "Undoable";
  return [
    `You are ${name}, a personal AI assistant running inside Undoable — a workflow system where every action is recorded and can be undone.`,
    "",
  ];
}

function buildSafetySection(): string[] {
  return [
    "## Safety",
    "You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.",
    "Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards.",
    "Do not manipulate or persuade anyone to expand access or disable safeguards. Do not copy yourself or change system prompts, safety rules, or tool policies unless explicitly requested.",
    "",
  ];
}

function buildToolingSection(toolDefs?: ToolDefinition[]): string[] {
  if (!toolDefs || toolDefs.length === 0) return [];

  const TOOL_CATEGORIES: Record<string, string[]> = {
    "Understanding (use FIRST)": ["project_info", "file_info", "codebase_search", "system_info"],
    "File Operations": ["read_file", "write_file", "edit_file", "list_dir", "find_files", "grep"],
    "Execution": ["exec", "process"],
    "Web (search → browse → fetch → browser)": ["web_search", "browse_page", "web_fetch", "browser"],
    "Action History & Undo": ["actions", "undo"],
    "Memory": ["memory_search", "memory_save", "memory_remove"],
    "Subagents": ["subagent_spawn", "subagent_list"],
    "Connectors": ["connect", "nodes"],
    "Workflow": ["list_runs", "create_run", "list_jobs", "create_job", "delete_job", "toggle_job", "run_job", "scheduler_status"],
  };

  const toolMap = new Map<string, ToolDefinition>();
  for (const t of toolDefs) toolMap.set(t.function.name, t);

  const lines = [
    "## Tooling",
    "Tool availability (filtered by policy). Tool names are case-sensitive; call tools exactly as listed.",
    "",
  ];

  for (const [category, names] of Object.entries(TOOL_CATEGORIES)) {
    const categoryTools = names.filter((n) => toolMap.has(n));
    if (categoryTools.length === 0) continue;
    lines.push(`### ${category}`);
    for (const name of categoryTools) {
      const def = toolMap.get(name)!;
      lines.push(`- **${name}**: ${def.function.description}`);
      toolMap.delete(name);
    }
    lines.push("");
  }

  const remaining = Array.from(toolMap.values());
  if (remaining.length > 0) {
    lines.push("### Other");
    for (const t of remaining) {
      lines.push(`- **${t.function.name}**: ${t.function.description}`);
    }
    lines.push("");
  }

  return lines;
}

function buildToolCallStyleSection(): string[] {
  return [
    "## Tool Call Style",
    "Default: do not narrate routine, low-risk tool calls (just call the tool).",
    "Narrate only when it helps: multi-step work, complex problems, sensitive actions (e.g., deletions), or when the user explicitly asks.",
    "Keep narration brief and value-dense; avoid repeating obvious steps.",
    "",
  ];
}

function buildWorkspaceSection(workspaceDir?: string): string[] {
  const dir = workspaceDir || os.homedir();
  return [
    "## Workspace",
    `Your working directory is: ${dir}`,
    "Treat this directory as the workspace for file operations unless explicitly instructed otherwise.",
    "All paths default to the user's home directory. Use absolute paths or ~/relative paths.",
    "",
  ];
}

function buildSkillsSection(skillsPrompt?: string): string[] {
  const trimmed = skillsPrompt?.trim();
  if (!trimmed) return [];
  return [
    "## Skills (mandatory)",
    "Before replying: scan <available_skills> <description> entries.",
    "- If exactly one skill clearly applies: read its SKILL.md at <location> with `read_file`, then follow it.",
    "- If multiple could apply: choose the most specific one, then read/follow it.",
    "- If none clearly apply: do not read any SKILL.md.",
    "Constraints: never read more than one skill up front; only read after selecting.",
    trimmed,
    "",
  ];
}

function buildInstructionsSection(instructions?: string): string[] {
  const trimmed = instructions?.trim();
  if (!trimmed) return [];
  return [
    "## Agent Instructions",
    trimmed,
    "",
  ];
}

function buildBehaviorSection(): string[] {
  return [
    "## Behavior Rules",
    "1. **Act, don't describe.** Call tools immediately when the user asks for something.",
    "2. **Start with high-level tools.** Use project_info before exploring files. Use web_search before browse_page. Use browse_page before raw web_fetch.",
    "3. **Use edit_file for targeted code changes.** Use write_file only for new files or full rewrites.",
    "4. **Chain tools when needed.** e.g., project_info → file_info → codebase_search → edit_file.",
    "5. **Confirm before destructive actions** (rm, overwrite, etc.).",
    "6. Use markdown formatting for readability.",
    "7. **For long-running commands**, use exec with background=true, then poll with the process tool.",
    "",
  ];
}

function buildPlatformSection(): string[] {
  const platform = os.platform();
  if (platform !== "darwin") return [];
  return [
    "## macOS Permissions",
    "On macOS, protected folders (Downloads, Desktop, Documents) require **Full Disk Access** for the terminal app.",
    "If a folder like ~/Downloads appears empty but the user says it has files, this is a TCC permissions issue.",
    "Guide the user: **System Settings → Privacy & Security → Full Disk Access → enable their terminal app**, then restart.",
    "",
  ];
}

function buildRuntimeSection(runtime?: SystemPromptParams["runtime"]): string[] {
  if (!runtime) return [];
  const parts: string[] = [];
  if (runtime.model) parts.push(`model=${runtime.model}`);
  if (runtime.provider) parts.push(`provider=${runtime.provider}`);
  if (runtime.os) parts.push(`os=${runtime.os}`);
  if (runtime.arch) parts.push(`arch=${runtime.arch}`);
  if (runtime.node) parts.push(`node=${runtime.node}`);
  if (parts.length === 0) return [];
  return [
    "## Runtime",
    parts.join(", "),
    "",
  ];
}

function buildContextFilesSection(files?: ContextFile[]): string[] {
  if (!files || files.length === 0) return [];
  const hasSoul = files.some((f) => f.path.toLowerCase().endsWith("soul.md"));
  const lines = [
    "# Project Context",
    "",
  ];
  if (hasSoul) {
    lines.push("If SOUL.md is present, embody its persona and tone. Follow its guidance unless higher-priority instructions override it.");
    lines.push("");
  }
  for (const file of files) {
    lines.push(`## ${file.path}`, "", file.content, "");
  }
  return lines;
}

export function buildSystemPrompt(params: SystemPromptParams): string {
  const lines = [
    ...buildIdentitySection(params.agentName),
    ...buildSafetySection(),
    ...buildToolingSection(params.toolDefinitions),
    ...buildToolCallStyleSection(),
    ...buildWorkspaceSection(params.workspaceDir),
    ...buildSkillsSection(params.skillsPrompt),
    ...buildInstructionsSection(params.agentInstructions),
    ...buildBehaviorSection(),
    ...buildPlatformSection(),
    ...buildRuntimeSection(params.runtime),
    ...buildContextFilesSection(params.contextFiles),
  ];

  return lines.filter((l) => l !== undefined).join("\n");
}
