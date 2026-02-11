import { PLAN_GRAPH_JSON_SCHEMA } from "./plan-schema.js";
import type { LLMContext } from "./types.js";

export function buildSystemPrompt(context: LLMContext): string {
  const parts: string[] = [
    "You are an AI coding agent. Your task is to generate a PlanGraph JSON that describes the steps needed to fulfill the user's instruction.",
    "",
    "## Output Format",
    "Respond with ONLY valid JSON matching this schema:",
    "```json",
    JSON.stringify(PLAN_GRAPH_JSON_SCHEMA, null, 2),
    "```",
    "",
    "## Rules",
    "- Each step must have a unique `id` (e.g. s1, s2, ...)",
    "- Use these tools: fs, git, shell, http, browser",
    "- Set `reversible: true` for steps that can be undone (file writes, git commits)",
    "- Set `reversible: false` for irreversible actions (HTTP POST, external API calls)",
    "- List required capabilities for each step (e.g. fs.write:/path, shell.exec:npm, git.write:*)",
    "- Use `dependsOn` to express step ordering constraints",
    "- Keep steps atomic — one action per step",
    "- Prefer git operations for version-controlled projects",
  ];

  if (context.repoStructure?.length) {
    parts.push("", "## Repository Structure", "```", context.repoStructure.join("\n"), "```");
  }

  if (context.gitStatus) {
    parts.push("", "## Git Status", "```", context.gitStatus, "```");
  }

  if (context.files?.length) {
    parts.push("", "## Relevant Files");
    for (const f of context.files) {
      parts.push(`### ${f.path}`, "```", f.content, "```");
    }
  }

  if (context.metadata && Object.keys(context.metadata).length > 0) {
    parts.push("", "## Additional Context", JSON.stringify(context.metadata, null, 2));
  }

  return parts.join("\n");
}

export function buildUserPrompt(instruction: string): string {
  return `Generate a PlanGraph for the following instruction:\n\n${instruction}`;
}
