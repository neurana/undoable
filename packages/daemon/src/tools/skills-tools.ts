import type { AgentTool } from "./types.js";
import type { SkillsService, SkillAgentTarget } from "../services/skills-service.js";

const DEFAULT_AGENT_TARGETS: SkillAgentTarget[] = ["codex"];

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function toFiniteInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.floor(value);
}

function summarizeSkills(skillsService: SkillsService) {
  return skillsService.list().map((skill) => ({
    name: skill.name,
    description: skill.description,
    emoji: skill.emoji ?? null,
    homepage: skill.homepage ?? null,
    source: skill.source,
    filePath: skill.filePath,
    eligible: skill.eligible,
    disabled: skill.disabled,
    missing: skill.missing,
    requires: skill.requires ?? null,
  }));
}

export function createSkillsTools(skillsService: SkillsService): AgentTool[] {
  return [
    {
      name: "skills_list",
      definition: {
        type: "function",
        function: {
          name: "skills_list",
          description:
            "List currently available local skills, their eligibility, and supported skills.sh agent targets.",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      },
      execute: async () => {
        const skills = summarizeSkills(skillsService);
        return {
          total: skills.length,
          eligible: skillsService.eligibleCount(),
          warning: skillsService.getDangerWarning(),
          supportedAgents: skillsService.getSupportedAgents(),
          skills,
        };
      },
    },
    {
      name: "skills_search",
      definition: {
        type: "function",
        function: {
          name: "skills_search",
          description:
            "Search the skills.sh registry by query and return installable references.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search text (example: 'shopify email automation').",
              },
            },
            required: [],
          },
        },
      },
      execute: async (args) => {
        const query = typeof args.query === "string" ? args.query : undefined;
        return skillsService.searchRegistry(query);
      },
    },
    {
      name: "skills_discover",
      definition: {
        type: "function",
        function: {
          name: "skills_discover",
          description:
            "Discover popular skills from skills.sh with pagination.",
          parameters: {
            type: "object",
            properties: {
              page: {
                type: "number",
                description: "Zero-based page index (default: 0).",
              },
              limit: {
                type: "number",
                description: "Results per page, 1-50 (default: 10).",
              },
            },
            required: [],
          },
        },
      },
      execute: async (args) => {
        const page = Math.max(0, toFiniteInteger(args.page, 0));
        const limit = Math.min(50, Math.max(1, toFiniteInteger(args.limit, 10)));
        return skillsService.discoverSkills(page, limit);
      },
    },
    {
      name: "skills_install",
      definition: {
        type: "function",
        function: {
          name: "skills_install",
          description:
            "Install a skills.sh skill reference (owner/repo or owner/repo@skill) for one or more agents. Defaults to agent=codex. Requires explicit user approval before execution.",
          parameters: {
            type: "object",
            properties: {
              reference: {
                type: "string",
                description: "Skill reference to install (owner/repo or owner/repo@skill-name).",
              },
              global: {
                type: "boolean",
                description: "Install globally (default: true).",
              },
              agents: {
                type: "array",
                items: { type: "string" },
                description: "Agent targets (codex, claude-code, cursor, windsurf, opencode).",
              },
            },
            required: ["reference"],
          },
        },
      },
      execute: async (args) => {
        const reference = typeof args.reference === "string" ? args.reference.trim() : "";
        if (!reference) {
          return { ok: false, installed: false, message: "reference is required" };
        }
        const requestedAgents = asStringArray(args.agents);
        const agents = requestedAgents.length > 0 ? requestedAgents : DEFAULT_AGENT_TARGETS;
        const global = typeof args.global === "boolean" ? args.global : undefined;
        return skillsService.installFromRegistry(reference, { global, agents });
      },
    },
    {
      name: "skills_installed",
      definition: {
        type: "function",
        function: {
          name: "skills_installed",
          description:
            "List installed skills from the skills.sh CLI.",
          parameters: {
            type: "object",
            properties: {
              global: {
                type: "boolean",
                description: "List global installs (default: true).",
              },
              agents: {
                type: "array",
                items: { type: "string" },
                description: "Optional agent targets to filter by.",
              },
            },
            required: [],
          },
        },
      },
      execute: async (args) => {
        const global = typeof args.global === "boolean" ? args.global : true;
        const agents = asStringArray(args.agents);
        return skillsService.listInstalled({
          global,
          agents: agents.length > 0 ? agents : undefined,
        });
      },
    },
    {
      name: "skills_check_updates",
      definition: {
        type: "function",
        function: {
          name: "skills_check_updates",
          description: "Check whether installed skills have updates available.",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      },
      execute: async () => skillsService.checkForUpdates(),
    },
    {
      name: "skills_update",
      definition: {
        type: "function",
        function: {
          name: "skills_update",
          description:
            "Update installed skills via skills.sh CLI. Requires explicit user approval before execution.",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      },
      execute: async () => skillsService.updateInstalled(),
    },
    {
      name: "skills_remove",
      definition: {
        type: "function",
        function: {
          name: "skills_remove",
          description:
            "Remove installed skills by reference or remove all. Defaults to global removals. Requires explicit user approval before execution.",
          parameters: {
            type: "object",
            properties: {
              references: {
                type: "array",
                items: { type: "string" },
                description: "Skill references to remove.",
              },
              all: {
                type: "boolean",
                description: "Remove all installed skills.",
              },
              global: {
                type: "boolean",
                description: "Remove global installs (default: true).",
              },
              agents: {
                type: "array",
                items: { type: "string" },
                description: "Optional agent targets.",
              },
            },
            required: [],
          },
        },
      },
      execute: async (args) => {
        const references = asStringArray(args.references);
        const all = args.all === true;
        if (!all && references.length === 0) {
          return {
            ok: false,
            message: "provide references or set all=true",
          };
        }
        const global = typeof args.global === "boolean" ? args.global : true;
        const agents = asStringArray(args.agents);
        return skillsService.removeInstalled({
          skills: references,
          all,
          global,
          agents: agents.length > 0 ? agents : undefined,
        });
      },
    },
    {
      name: "skills_toggle",
      definition: {
        type: "function",
        function: {
          name: "skills_toggle",
          description:
            "Enable or disable a local skill by name without uninstalling it.",
          parameters: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Local skill name.",
              },
              enabled: {
                type: "boolean",
                description: "True to enable, false to disable.",
              },
            },
            required: ["name", "enabled"],
          },
        },
      },
      execute: async (args) => {
        const name = typeof args.name === "string" ? args.name.trim() : "";
        if (!name) return { ok: false, message: "name is required" };
        const enabled = args.enabled === true;
        const skill = skillsService.getByName(name);
        if (!skill) return { ok: false, message: `skill "${name}" not found` };
        skillsService.toggle(name, enabled);
        const updated = skillsService.getByName(name);
        return {
          ok: true,
          name,
          enabled,
          skill: updated
            ? {
                name: updated.name,
                disabled: updated.disabled,
                eligible: updated.eligible,
                missing: updated.missing,
              }
            : null,
        };
      },
    },
  ];
}
