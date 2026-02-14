import path from "node:path";
import os from "node:os";
import Fastify from "fastify";
import { EventBus, SchedulerService, AgentRegistry } from "@undoable/core";
import type { SchedulerEvent } from "@undoable/core";
import { healthRoutes } from "../routes/health.js";
import { runRoutes } from "../routes/runs.js";
import { eventRoutes } from "../routes/events.js";
import { jobRoutes } from "../routes/jobs.js";
import { chatRoutes } from "../routes/chat.js";
import { agentRoutes } from "../routes/agents.js";
import { voiceRoutes } from "../routes/voice.js";
import { RunManager } from "../services/run-manager.js";
import { AuditService } from "../services/audit-service.js";
import { ChatService } from "../services/chat-service.js";
import { createBrowserService } from "../services/browser-service.js";
import { SkillsService } from "../services/skills-service.js";
import { skillsRoutes } from "../routes/skills.js";
import { instructionsRoutes } from "../routes/instructions.js";
import { InstructionsStore } from "../services/instructions-store.js";
import { createGatewayAuthHook } from "../auth/middleware.js";
import { resolveRunMode, shouldAutoApprove, type RunMode } from "../actions/run-mode.js";
import { ProviderService } from "../services/provider-service.js";
import { MemoryService } from "../services/memory-service.js";
import { SandboxExecService } from "../services/sandbox-exec.js";
import { HeartbeatService } from "../services/heartbeat-service.js";
import { heartbeatRoutes } from "../routes/heartbeat.js";
import { CanvasService } from "../services/canvas-service.js";
import { fileRoutes } from "../routes/files.js";

export type ServerOptions = {
  port: number;
  host?: string;
};


export async function createServer(opts: ServerOptions) {
  const app = Fastify({ logger: true });

  const eventBus = new EventBus();
  const runManager = new RunManager(eventBus);

  // Persist all run events so they can be replayed on reconnect
  eventBus.onAll((event) => {
    runManager.appendEvent(event.runId, event);
  });

  const auditService = new AuditService();
  const agentRegistry = new AgentRegistry();
  await agentRegistry.init();
  const instructionsStore = new InstructionsStore();
  await instructionsStore.init();
  // Seed default agent only if no agents were loaded from disk
  if (agentRegistry.list().length === 0) {
    const defaultModel = process.env.UNDOABLE_MODEL ?? "gpt-4.1-mini";
    agentRegistry.register({
      id: "default",
      name: "Default",
      model: defaultModel,
      skills: [],
      sandbox: { docker: false, network: true, browser: true },
      default: true,
    });
  }

  // executorDepsRef will be set after tool registry is created, so scheduler can trigger run execution
  let executorDepsRef: { deps: import("../services/run-executor.js").RunExecutorDeps } | null = null;

  const storePath = path.join(os.homedir(), ".undoable", "scheduler-jobs.json");

  const SCHEDULED_JOB_SYSTEM_PROMPT = [
    "You are Undoable executing a SCHEDULED JOB. This is an automated task — not an interactive conversation.",
    "",
    "IMPORTANT RULES:",
    "1. Execute the instruction immediately using your tools. Do NOT ask clarifying questions.",
    "2. Do NOT greet the user or ask what they need. The instruction below is the complete task.",
    "3. Use your tools (exec, browser, web_fetch, read_file, write_file, etc.) to accomplish the task.",
    "4. When done, return a concise summary of what you did and the results.",
    "5. If the task cannot be completed, explain why in your response.",
    "",
    "You have full access to the system. Act autonomously and complete the task.",
  ].join("\n");

  const scheduler = new SchedulerService({
    config: { enabled: true, storePath },
    executor: async (job) => {
      if (job.payload.kind === "run") {
        const agentId = job.payload.agentId ?? "default";
        const run = runManager.create({
          userId: "scheduler",
          agentId,
          instruction: job.payload.instruction,
        });
        app.log.info({ jobId: job.id, runId: run.id, agentId }, "scheduler: created run");
        if (executorDepsRef) {
          try {
            const { executeRun } = await import("../services/run-executor.js");
            await executeRun(run.id, job.payload.instruction, {
              ...executorDepsRef.deps,
              systemPrompt: SCHEDULED_JOB_SYSTEM_PROMPT,
              maxIterations: 50,
            });
            const finalStatus = runManager.getById(run.id)?.status;
            if (finalStatus === "failed") {
              return { status: "error", error: "Run finished with failed status", runId: run.id };
            }
            return { status: "ok", runId: run.id };
          } catch (err) {
            app.log.error({ runId: run.id, err }, "scheduler: run execution failed");
            return { status: "error", error: String(err), runId: run.id };
          }
        }
        return { status: "error", error: "Executor dependencies not available" };
      } else {
        app.log.info({ jobId: job.id, text: job.payload.text }, "scheduler: system event");
        return { status: "ok" };
      }
    },
    onEvent: (evt: SchedulerEvent) => {
      app.log.info({ scheduler: evt }, "scheduler event");
    },
  });

  const gatewayToken = process.env.UNDOABLE_TOKEN;
  app.addHook("onRequest", createGatewayAuthHook(gatewayToken));

  const chatService = new ChatService();
  const runMode = resolveRunMode({
    mode: (process.env.UNDOABLE_RUN_MODE as RunMode | undefined) ?? undefined,
    maxIterations: process.env.UNDOABLE_MAX_ITERATIONS ? Number(process.env.UNDOABLE_MAX_ITERATIONS) : undefined,
    dangerouslySkipPermissions: process.env.UNDOABLE_DANGEROUSLY_SKIP_PERMISSIONS === "1",
  });
  const initialApiKey = process.env.OPENAI_API_KEY ?? "";
  const initialModel = process.env.UNDOABLE_MODEL ?? "gpt-4.1-mini";
  const initialBaseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const chatConfig = {
    apiKey: initialApiKey,
    model: initialModel,
    baseUrl: initialBaseUrl,
    runMode,
  };
  const providerSvc = new ProviderService();
  await providerSvc.init(initialApiKey, initialModel, initialBaseUrl);
  app.log.info({ runMode: runMode.mode, maxIterations: runMode.maxIterations, skipPerms: runMode.dangerouslySkipPermissions, model: initialModel }, "run mode configured");

  const skillsService = new SkillsService();
  const memorySvc = new MemoryService();
  await memorySvc.init();
  const sandboxExec = new SandboxExecService();
  const heartbeatSvc = new HeartbeatService();
  heartbeatSvc.start({
    onSessionDead: (id) => app.log.info({ sessionId: id }, "session marked dead by heartbeat"),
  });
  const browserSvc = await createBrowserService();
  const canvasService = new CanvasService();

  const { createToolRegistry } = await import("../tools/index.js");
  const { callLLM } = await import("../routes/chat.js");
  const runRegistry = createToolRegistry({ runManager, scheduler, browserSvc, memoryService: memorySvc, canvasService, approvalMode: shouldAutoApprove(runMode) ? "off" as const : undefined });

  const boundCallLLM = (messages: unknown[], toolDefs: unknown[], stream: boolean) => {
    const conf = providerSvc
      ? { ...chatConfig, ...providerSvc.getActiveConfig() }
      : chatConfig;
    return callLLM(conf, messages, toolDefs, stream as true);
  };

  executorDepsRef = {
    deps: {
      chatService,
      runManager,
      eventBus,
      registry: runRegistry,
      providerService: providerSvc,
      callLLM: boundCallLLM,
      maxIterations: runMode.maxIterations ?? 25,
    },
  };

  await app.register(healthRoutes);
  runRoutes(app, runManager, auditService, {
    eventBus,
    executorDeps: {
      chatService,
      registry: runRegistry,
      providerService: providerSvc,
      callLLM: boundCallLLM,
      maxIterations: runMode.maxIterations ?? 25,
    },
  });
  eventRoutes(app, eventBus, runManager);
  jobRoutes(app, scheduler);
  agentRoutes(app, agentRegistry, instructionsStore);
  instructionsRoutes(app, instructionsStore);
  voiceRoutes(app, { apiKey: chatConfig.apiKey, baseUrl: chatConfig.baseUrl });
  skillsRoutes(app, skillsService);
  heartbeatRoutes(app, heartbeatSvc);
  chatRoutes(app, chatService, chatConfig, runManager, scheduler, browserSvc, skillsService, providerSvc, agentRegistry, instructionsStore, memorySvc, sandboxExec, heartbeatSvc);
  fileRoutes(app);

  return {
    start: async () => {
      await scheduler.start();
      const host = opts.host ?? "127.0.0.1";
      await app.listen({ port: opts.port, host });
    },
    stop: async () => {
      scheduler.stop();
      heartbeatSvc.stop();
      await providerSvc.destroy();
      await browserSvc.close();
      await app.close();
    },
    app,
  };
}
