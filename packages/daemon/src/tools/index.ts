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

export type { AgentTool, ToolDefinition, ToolExecutor, ToolResult } from "./types.js";

export type ToolRegistry = {
  tools: AgentTool[];
  definitions: ToolDefinition[];
  execute: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  actionLog: ActionLog;
  approvalGate: ApprovalGate;
  undoService: UndoService;
};

export function createToolRegistry(deps: {
  runManager: RunManager;
  scheduler: SchedulerService;
  browserSvc: BrowserService;
  connectorRegistry?: ConnectorRegistry;
  approvalMode?: ApprovalMode;
  runId?: string;
}): ToolRegistry {
  const connectorRegistry = deps.connectorRegistry ?? new ConnectorRegistry();
  const actionLog = new ActionLog();
  const approvalGate = new ApprovalGate(deps.approvalMode ?? "off");
  const undoService = new UndoService(actionLog);

  const rawTools: AgentTool[] = [
    createExecTool(),
    createProcessTool(),
    createReadFileTool(),
    createWriteFileTool(),
    createEditFileTool(),
    createListDirTool(),
    createFindFilesTool(),
    createGrepTool(),
    createCodebaseSearchTool(),
    createWebFetchTool(),
    createBrowsePageTool(deps.browserSvc),
    createBrowserTool(deps.browserSvc),
    createProjectInfoTool(),
    createFileInfoTool(),
    createSystemInfoTool(),
    ...createWorkflowTools(deps.runManager, deps.scheduler),
    ...createConnectorTools(connectorRegistry),
    ...createActionTools(actionLog, approvalGate, undoService),
  ];

  const tools = wrapAllTools(rawTools, { actionLog, approvalGate, runId: deps.runId });

  const toolMap = new Map<string, AgentTool>();
  for (const tool of tools) toolMap.set(tool.name, tool);

  return {
    tools,
    definitions: tools.map((t) => t.definition),
    execute: async (name, args) => {
      const tool = toolMap.get(name);
      if (!tool) return { error: `Unknown tool: ${name}` };
      return tool.execute(args);
    },
    actionLog,
    approvalGate,
    undoService,
  };
}
