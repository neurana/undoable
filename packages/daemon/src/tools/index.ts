import type { AgentTool, ToolDefinition } from "./types.js";
import type { RunManager } from "../services/run-manager.js";
import type { SchedulerService } from "@undoable/core";
import type { BrowserService } from "../services/browser-service.js";
import { createExecTool } from "./exec-tool.js";
import { createProcessTool } from "./process-tool.js";
import {
  createReadFileTool,
  createWriteFileTool,
  createEditFileTool,
  createListDirTool,
  createFindFilesTool,
  createGrepTool,
  createCodebaseSearchTool,
} from "./file-tools.js";
import {
  createWebFetchTool,
  createBrowsePageTool,
  createBrowserTool,
} from "./web-tools.js";
import { createWebSearchTool } from "./search-tool.js";
import {
  createProjectInfoTool,
  createFileInfoTool,
  createSystemInfoTool,
} from "./system-tools.js";
import { createWorkflowTools } from "./workflow-tools.js";
import { createConnectorTools } from "./connector-tools.js";
import { ConnectorRegistry } from "../connectors/index.js";
import { ActionLog } from "../actions/action-log.js";
import { ApprovalGate } from "../actions/approval-gate.js";
import { UndoService } from "../actions/undo-service.js";
import { wrapAllTools } from "../actions/tool-middleware.js";
import type { ApprovalMode } from "../actions/types.js";
import { createActionTools } from "./action-tools.js";
import { createMemoryTools } from "./memory-tools.js";
import type { MemoryService } from "../services/memory-service.js";
import type { SandboxExecService } from "../services/sandbox-exec.js";
import { createCanvasTool } from "./canvas-tools.js";
import type { CanvasService } from "../services/canvas-service.js";
import { createNodeTools } from "./node-tools.js";
import type { SwarmService } from "../services/swarm-service.js";
import { createSwarmTools } from "./swarm/index.js";
import type { ChannelManager } from "../channels/channel-manager.js";
import { createChannelTools } from "./channel-tools.js";

export type { AgentTool, ToolDefinition, ToolExecutor, ToolResult } from "./types.js";

export type ToolRegistry = {
  tools: AgentTool[];
  definitions: ToolDefinition[];
  execute: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  registerTools: (newTools: AgentTool[]) => void;
  actionLog: ActionLog;
  approvalGate: ApprovalGate;
  undoService: UndoService;
};

export function createToolRegistry(deps: {
  runManager: RunManager;
  scheduler: SchedulerService;
  browserSvc: BrowserService;
  connectorRegistry?: ConnectorRegistry;
  memoryService?: MemoryService;
  canvasService?: CanvasService;
  swarmService?: SwarmService;
  sandboxExec?: SandboxExecService;
  sandboxSessionId?: string;
  approvalMode?: ApprovalMode;
  runId?: string;
  channelManager?: ChannelManager;
}): ToolRegistry {
  const connectorRegistry = deps.connectorRegistry ?? new ConnectorRegistry();
  const actionLog = new ActionLog();
  const approvalGate = new ApprovalGate(deps.approvalMode ?? "always");
  const undoService = new UndoService(actionLog);

  const rawTools: AgentTool[] = [
    /* Exec & process */
    createExecTool({ sandboxExec: deps.sandboxExec, sandboxSessionId: deps.sandboxSessionId }),
    createProcessTool(),

    /* File operations */
    createReadFileTool(),
    createWriteFileTool(),
    createEditFileTool(),
    createListDirTool(),
    createFindFilesTool(),
    createGrepTool(),
    createCodebaseSearchTool(),

    /* Web & browser */
    createWebSearchTool(),
    createWebFetchTool(),
    createBrowsePageTool(deps.browserSvc),
    createBrowserTool(deps.browserSvc),

    /* System info */
    createProjectInfoTool(),
    createFileInfoTool(),
    createSystemInfoTool(),

    /* Workflow & scheduling */
    ...createWorkflowTools(deps.runManager, deps.scheduler),

    /* SWARM workflows */
    ...(deps.swarmService ? createSwarmTools(deps.swarmService, deps.runManager) : []),

    /* Connectors */
    ...createConnectorTools(connectorRegistry),

    /* Actions (approval, undo) */
    ...createActionTools(actionLog, approvalGate, undoService),

    /* Memory (with vector search) */
    ...(deps.memoryService ? createMemoryTools(deps.memoryService) : []),

    /* Canvas (A2UI) */
    ...(deps.canvasService ? [createCanvasTool(deps.canvasService, deps.browserSvc)] : []),

    /* Node/device tools */
    ...createNodeTools(connectorRegistry),

    /* Channel action tools */
    ...(deps.channelManager ? createChannelTools(deps.channelManager) : []),
  ];

  const tools = wrapAllTools(rawTools, { actionLog, approvalGate, runId: deps.runId });

  const toolMap = new Map<string, AgentTool>();
  for (const tool of tools) toolMap.set(tool.name, tool);

  const registry: ToolRegistry = {
    tools,
    definitions: tools.map((t) => t.definition),
    execute: async (name, args) => {
      const tool = toolMap.get(name);
      if (!tool) return { error: `Unknown tool: ${name}` };
      return tool.execute(args);
    },
    registerTools: (newTools: AgentTool[]) => {
      for (const t of newTools) {
        toolMap.set(t.name, t);
        registry.tools.push(t);
        registry.definitions.push(t.definition);
      }
    },
    actionLog,
    approvalGate,
    undoService,
  };

  return registry;
}
