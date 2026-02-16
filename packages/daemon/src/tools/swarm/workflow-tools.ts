import type { SwarmService } from "../../services/swarm-service.js";
import type { AgentTool } from "../types.js";
import { asError, asOptionalString } from "./shared.js";

export function createSwarmWorkflowTools(swarmService: SwarmService): AgentTool[] {
  return [
    {
      name: "swarm_list_workflows",
      definition: {
        type: "function",
        function: {
          name: "swarm_list_workflows",
          description: "List all SWARM workflows.",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      execute: async () => swarmService.list(),
    },
    {
      name: "swarm_get_workflow",
      definition: {
        type: "function",
        function: {
          name: "swarm_get_workflow",
          description: "Get one SWARM workflow by id.",
          parameters: {
            type: "object",
            properties: {
              workflowId: { type: "string", description: "Workflow ID" },
            },
            required: ["workflowId"],
          },
        },
      },
      execute: async (args) => {
        const workflowId = asOptionalString(args.workflowId);
        if (!workflowId) return { error: "workflowId is required" };
        const workflow = swarmService.getById(workflowId);
        return workflow ?? { error: `workflow ${workflowId} not found` };
      },
    },
    {
      name: "swarm_create_workflow",
      definition: {
        type: "function",
        function: {
          name: "swarm_create_workflow",
          description: "Create a SWARM workflow orchestrator.",
          parameters: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              orchestratorAgentId: { type: "string" },
              enabled: { type: "boolean" },
            },
            required: ["name"],
          },
        },
      },
      execute: async (args) => {
        try {
          return await swarmService.create({
            id: asOptionalString(args.id),
            name: String(args.name ?? ""),
            description: asOptionalString(args.description),
            orchestratorAgentId: asOptionalString(args.orchestratorAgentId),
            enabled: typeof args.enabled === "boolean" ? args.enabled : undefined,
          });
        } catch (error) {
          return asError(error);
        }
      },
    },
    {
      name: "swarm_update_workflow",
      definition: {
        type: "function",
        function: {
          name: "swarm_update_workflow",
          description: "Update SWARM workflow metadata.",
          parameters: {
            type: "object",
            properties: {
              workflowId: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              orchestratorAgentId: { type: "string" },
              enabled: { type: "boolean" },
            },
            required: ["workflowId"],
          },
        },
      },
      execute: async (args) => {
        try {
          const workflowId = asOptionalString(args.workflowId);
          if (!workflowId) return { error: "workflowId is required" };
          const updated = await swarmService.update(workflowId, {
            name: args.name === undefined ? undefined : String(args.name),
            description: args.description === undefined ? undefined : String(args.description),
            orchestratorAgentId: args.orchestratorAgentId === undefined ? undefined : String(args.orchestratorAgentId),
            enabled: typeof args.enabled === "boolean" ? args.enabled : undefined,
          });
          return updated ?? { error: `workflow ${workflowId} not found` };
        } catch (error) {
          return asError(error);
        }
      },
    },
    {
      name: "swarm_delete_workflow",
      definition: {
        type: "function",
        function: {
          name: "swarm_delete_workflow",
          description: "Delete a SWARM workflow.",
          parameters: {
            type: "object",
            properties: {
              workflowId: { type: "string" },
            },
            required: ["workflowId"],
          },
        },
      },
      execute: async (args) => {
        const workflowId = asOptionalString(args.workflowId);
        if (!workflowId) return { error: "workflowId is required" };
        const deleted = await swarmService.delete(workflowId);
        return deleted
          ? { deleted: true, workflowId }
          : { error: `workflow ${workflowId} not found` };
      },
    },
    {
      name: "swarm_reconcile_jobs",
      definition: {
        type: "function",
        function: {
          name: "swarm_reconcile_jobs",
          description: "Ensure SWARM node schedule jobs are synchronized with scheduler.",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      execute: async () => swarmService.reconcileJobs(),
    },
  ];
}
