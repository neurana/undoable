import type { RunManager } from "../../services/run-manager.js";
import type { SwarmNodeType, SwarmService } from "../../services/swarm-service.js";
import type { AgentTool } from "../types.js";
import {
  SWARM_NODE_TYPES,
  SWARM_SCHEDULE_MODES,
  asError,
  asOptionalRecord,
  asOptionalString,
  asOptionalStringArray,
  parseScheduleFromArgs,
} from "./shared.js";

export function createSwarmNodeTools(
  swarmService: SwarmService,
  runManager: RunManager,
): AgentTool[] {
  return [
    {
      name: "swarm_add_node",
      definition: {
        type: "function",
        function: {
          name: "swarm_add_node",
          description: "Add a node to a SWARM workflow.",
          parameters: {
            type: "object",
            properties: {
              workflowId: { type: "string" },
              id: { type: "string" },
              name: { type: "string" },
              type: { type: "string", enum: SWARM_NODE_TYPES },
              prompt: { type: "string" },
              agentId: { type: "string" },
              skillRefs: { type: "array", items: { type: "string" } },
              enabled: { type: "boolean" },
              scheduleMode: { type: "string", enum: SWARM_SCHEDULE_MODES },
              everySeconds: { type: "number" },
              atISO: { type: "string" },
              cronExpr: { type: "string" },
              timezone: { type: "string" },
              config: { type: "object" },
            },
            required: ["workflowId", "name"],
          },
        },
      },
      execute: async (args) => {
        try {
          const workflowId = asOptionalString(args.workflowId);
          if (!workflowId) return { error: "workflowId is required" };
          const node = await swarmService.addNode(workflowId, {
            id: asOptionalString(args.id),
            name: String(args.name ?? ""),
            type: asOptionalString(args.type) as SwarmNodeType | undefined,
            prompt: asOptionalString(args.prompt),
            agentId: asOptionalString(args.agentId),
            skillRefs: asOptionalStringArray(args.skillRefs),
            enabled: typeof args.enabled === "boolean" ? args.enabled : undefined,
            schedule: parseScheduleFromArgs(args, { strict: true }),
            config: asOptionalRecord(args.config),
          });
          return node ?? { error: `workflow ${workflowId} not found` };
        } catch (error) {
          return asError(error);
        }
      },
    },
    {
      name: "swarm_update_node",
      definition: {
        type: "function",
        function: {
          name: "swarm_update_node",
          description: "Update a node in a SWARM workflow.",
          parameters: {
            type: "object",
            properties: {
              workflowId: { type: "string" },
              nodeId: { type: "string" },
              name: { type: "string" },
              type: { type: "string", enum: SWARM_NODE_TYPES },
              prompt: { type: "string" },
              agentId: { type: "string" },
              skillRefs: { type: "array", items: { type: "string" } },
              enabled: { type: "boolean" },
              scheduleMode: { type: "string", enum: SWARM_SCHEDULE_MODES },
              everySeconds: { type: "number" },
              atISO: { type: "string" },
              cronExpr: { type: "string" },
              timezone: { type: "string" },
              config: { type: "object" },
            },
            required: ["workflowId", "nodeId"],
          },
        },
      },
      execute: async (args) => {
        try {
          const workflowId = asOptionalString(args.workflowId);
          const nodeId = asOptionalString(args.nodeId);
          if (!workflowId || !nodeId) return { error: "workflowId and nodeId are required" };

          const patch = {
            name: args.name === undefined ? undefined : String(args.name),
            type: asOptionalString(args.type) as SwarmNodeType | undefined,
            prompt: args.prompt === undefined ? undefined : String(args.prompt),
            agentId: args.agentId === undefined ? undefined : String(args.agentId),
            skillRefs: asOptionalStringArray(args.skillRefs),
            enabled: typeof args.enabled === "boolean" ? args.enabled : undefined,
            schedule: parseScheduleFromArgs(args),
            config: asOptionalRecord(args.config),
          };

          const node = await swarmService.updateNode(workflowId, nodeId, patch);
          return node ?? { error: `workflow ${workflowId} or node ${nodeId} not found` };
        } catch (error) {
          return asError(error);
        }
      },
    },
    {
      name: "swarm_remove_node",
      definition: {
        type: "function",
        function: {
          name: "swarm_remove_node",
          description: "Remove node from SWARM workflow.",
          parameters: {
            type: "object",
            properties: {
              workflowId: { type: "string" },
              nodeId: { type: "string" },
            },
            required: ["workflowId", "nodeId"],
          },
        },
      },
      execute: async (args) => {
        const workflowId = asOptionalString(args.workflowId);
        const nodeId = asOptionalString(args.nodeId);
        if (!workflowId || !nodeId) return { error: "workflowId and nodeId are required" };
        const deleted = await swarmService.removeNode(workflowId, nodeId);
        return deleted
          ? { deleted: true, workflowId, nodeId }
          : { error: `workflow ${workflowId} or node ${nodeId} not found` };
      },
    },
    {
      name: "swarm_set_edges",
      definition: {
        type: "function",
        function: {
          name: "swarm_set_edges",
          description: "Replace all workflow edges in one operation.",
          parameters: {
            type: "object",
            properties: {
              workflowId: { type: "string" },
              edges: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    condition: { type: "string" },
                  },
                  required: ["from", "to"],
                },
              },
            },
            required: ["workflowId", "edges"],
          },
        },
      },
      execute: async (args) => {
        try {
          const workflowId = asOptionalString(args.workflowId);
          if (!workflowId) return { error: "workflowId is required" };
          const edges = Array.isArray(args.edges) ? args.edges : [];
          const workflow = await swarmService.setEdges(workflowId, edges as Array<{ from: string; to: string; condition?: string }>);
          return workflow ?? { error: `workflow ${workflowId} not found` };
        } catch (error) {
          return asError(error);
        }
      },
    },
    {
      name: "swarm_upsert_edge",
      definition: {
        type: "function",
        function: {
          name: "swarm_upsert_edge",
          description: "Create or update one workflow edge.",
          parameters: {
            type: "object",
            properties: {
              workflowId: { type: "string" },
              from: { type: "string" },
              to: { type: "string" },
              condition: { type: "string" },
            },
            required: ["workflowId", "from", "to"],
          },
        },
      },
      execute: async (args) => {
        try {
          const workflowId = asOptionalString(args.workflowId);
          const from = asOptionalString(args.from);
          const to = asOptionalString(args.to);
          if (!workflowId || !from || !to) return { error: "workflowId, from and to are required" };
          const workflow = await swarmService.upsertEdge(workflowId, {
            from,
            to,
            condition: asOptionalString(args.condition),
          });
          return workflow ?? { error: `workflow ${workflowId} not found` };
        } catch (error) {
          return asError(error);
        }
      },
    },
    {
      name: "swarm_remove_edge",
      definition: {
        type: "function",
        function: {
          name: "swarm_remove_edge",
          description: "Remove one edge from SWARM workflow.",
          parameters: {
            type: "object",
            properties: {
              workflowId: { type: "string" },
              from: { type: "string" },
              to: { type: "string" },
            },
            required: ["workflowId", "from", "to"],
          },
        },
      },
      execute: async (args) => {
        const workflowId = asOptionalString(args.workflowId);
        const from = asOptionalString(args.from);
        const to = asOptionalString(args.to);
        if (!workflowId || !from || !to) return { error: "workflowId, from and to are required" };
        const deleted = await swarmService.removeEdge(workflowId, from, to);
        return deleted
          ? { deleted: true, workflowId, from, to }
          : { error: `workflow ${workflowId} or edge ${from}->${to} not found` };
      },
    },
    {
      name: "swarm_list_node_runs",
      definition: {
        type: "function",
        function: {
          name: "swarm_list_node_runs",
          description: "List execution runs for one SWARM node by mapped jobId.",
          parameters: {
            type: "object",
            properties: {
              workflowId: { type: "string" },
              nodeId: { type: "string" },
            },
            required: ["workflowId", "nodeId"],
          },
        },
      },
      execute: async (args) => {
        const workflowId = asOptionalString(args.workflowId);
        const nodeId = asOptionalString(args.nodeId);
        if (!workflowId || !nodeId) return { error: "workflowId and nodeId are required" };

        const workflow = swarmService.getById(workflowId);
        if (!workflow) return { error: `workflow ${workflowId} not found` };

        const node = workflow.nodes.find((entry) => entry.id === nodeId);
        if (!node) return { error: `node ${nodeId} not found` };

        if (!node.jobId) return { jobId: null, runs: [] };

        return {
          jobId: node.jobId,
          runs: runManager.listByJobId(node.jobId),
        };
      },
    },
  ];
}
