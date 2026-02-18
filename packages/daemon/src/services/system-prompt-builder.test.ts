import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./system-prompt-builder.js";
import type { ToolDefinition } from "../tools/types.js";

function tool(name: string, description = "test tool"): ToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties: {}, required: [] },
    },
  };
}

describe("buildSystemPrompt automation defaults", () => {
  it("includes automation-first guardrails and avoids default external recommendations", () => {
    const prompt = buildSystemPrompt({
      toolDefinitions: [
        tool("swarm_create_workflow"),
        tool("swarm_add_node"),
        tool("swarm_set_edges"),
        tool("swarm_update_workflow"),
        tool("exec"),
        tool("web_fetch"),
      ],
    });

    expect(prompt).toContain("## Automation Defaults");
    expect(prompt).toContain("Do not default to external platforms (Zapier/Make/n8n)");
    expect(prompt).toContain("Ask only blocking clarification questions");
    expect(prompt).toContain("If an integration has no dedicated tool, implement it inside Undoable");
  });

  it("lists native messaging channels when channel action tools are available", () => {
    const prompt = buildSystemPrompt({
      toolDefinitions: [
        tool("discord_actions"),
        tool("slack_actions"),
        tool("telegram_actions"),
        tool("whatsapp_actions"),
      ],
    });

    expect(prompt).toContain("Native messaging channels available in this runtime");
    expect(prompt).toContain("Discord");
    expect(prompt).toContain("Slack");
    expect(prompt).toContain("Telegram");
    expect(prompt).toContain("WhatsApp");
  });

  it("shows skills.sh tooling category when skills tools are available", () => {
    const prompt = buildSystemPrompt({
      toolDefinitions: [
        tool("skills_search"),
        tool("skills_install"),
      ],
    });

    expect(prompt).toContain("Skills (skills.sh)");
    expect(prompt).toContain("skills_search");
    expect(prompt).toContain("skills_install");
  });

  it("uses compact sections in economy mode", () => {
    const prompt = buildSystemPrompt({
      economyMode: true,
      toolDefinitions: [
        tool("swarm_create_workflow"),
        tool("swarm_add_node"),
        tool("exec"),
      ],
    });

    expect(prompt).toContain("Economy mode is enabled");
    expect(prompt).not.toContain("## SWARM System");
    expect(prompt).not.toContain("## Automation Defaults");
    expect(prompt).toContain("## Behavior Rules");
  });
});
