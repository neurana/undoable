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

  it("injects auto skill discovery guidance when runtime hints are provided", () => {
    const prompt = buildSystemPrompt({
      toolDefinitions: [tool("skills_search"), tool("skills_install")],
      autoSkillDiscoveryPrompt:
        "Query: deploy github actions\n- vercel-labs/skills@find-skills (https://skills.sh/vercel-labs/skills/find-skills)",
    });

    expect(prompt).toContain("## Auto Skill Discovery");
    expect(prompt).toContain("Never install skills silently");
    expect(prompt).toContain("skills_install");
    expect(prompt).toContain("Query: deploy github actions");
  });

  it("adds a dedicated swarm-mode section when swarm mode is enabled", () => {
    const prompt = buildSystemPrompt({
      swarmMode: true,
      toolDefinitions: [tool("swarm_create_workflow")],
    });

    expect(prompt).toContain("## SWARM Mode (Active)");
    expect(prompt).toContain("swarm-first execution");
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
    expect(prompt).toContain("## Capability Grounding");
    expect(prompt).toContain("## Interaction Style");
    expect(prompt).toContain("## Undo Guarantee Protocol");
    expect(prompt).not.toContain("When the user asks for reliability/audit");
  });

  it("adds interaction guidance to avoid repetitive canned greetings", () => {
    const prompt = buildSystemPrompt({});

    expect(prompt).toContain("## Interaction Style");
    expect(prompt).toContain("Avoid repetitive canned openers");
    expect(prompt).toContain("If the user gives a concrete request, execute/answer directly");
  });

  it("includes strict undo protocol and recovery guidance by default", () => {
    const prompt = buildSystemPrompt({
      toolDefinitions: [tool("undo"), tool("edit_file"), tool("write_file")],
    });

    expect(prompt).toContain("## Undo Guarantee Protocol");
    expect(prompt).toContain("Strict mode is active");
    expect(prompt).toContain("undo(action:\"redo_one\")");
    expect(prompt).toContain("state the exact blocker and ask to enable irreversible actions");
  });

  it("switches undo protocol language when irreversible actions are allowed", () => {
    const prompt = buildSystemPrompt({
      undoGuaranteeEnabled: false,
      toolDefinitions: [tool("undo")],
    });

    expect(prompt).toContain("Irreversible mode is active");
    expect(prompt).not.toContain("Strict mode is active");
  });
});
