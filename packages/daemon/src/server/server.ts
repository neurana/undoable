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
import {
  authorizeGatewayHeaders,
  createGatewayAuthHook,
} from "../auth/middleware.js";
import {
  resolveRunMode,
  shouldAutoApprove,
  type RunMode,
} from "../actions/run-mode.js";
import { ProviderService } from "../services/provider-service.js";
import { MemoryService } from "../services/memory-service.js";
import { SandboxExecService } from "../services/sandbox-exec.js";
import { HeartbeatService } from "../services/heartbeat-service.js";
import { heartbeatRoutes } from "../routes/heartbeat.js";
import { swarmRoutes } from "../routes/swarm.js";
import { CanvasService } from "../services/canvas-service.js";
import { fileRoutes } from "../routes/files.js";
import { channelRoutes } from "../routes/channels.js";
import { gatewayRoutes } from "../routes/gateway.js";
import {
  ChannelManager,
  createTelegramChannel,
  createDiscordChannel,
  createSlackChannel,
  createWhatsAppChannel,
} from "../channels/index.js";
import { sessionRoutes } from "../routes/sessions.js";
import { WizardService } from "../services/wizard-service.js";
import { CronRunLogService } from "../services/cron-run-log-service.js";
import { ExecApprovalService } from "../services/exec-approval-service.js";
import { NodeGatewayService } from "../services/node-gateway-service.js";
import { ConnectorRegistry } from "../connectors/index.js";
import {
  CANVAS_HOST_PATH,
  CANVAS_WS_PATH,
  createCanvasHostHandler,
} from "../services/canvas-host.js";
import { recoverExecRegistryState } from "../tools/exec-registry.js";
import { SwarmService } from "../services/swarm-service.js";
import { MediaService } from "../services/media-service.js";
import { TtsService } from "../services/tts-service.js";
import { SttService } from "../services/stt-service.js";
import { MediaUnderstandingService } from "../services/media-understanding.js";
import { UsageService } from "../services/usage-service.js";
import { PluginRegistry } from "../plugins/registry.js";
import { pluginRoutes } from "../routes/plugins.js";
import type { PluginContext } from "../plugins/types.js";
import {
  initDatabase,
  isDatabaseEnabled,
} from "../services/database-service.js";

export type ServerOptions = {
  port: number;
  host?: string;
};

export async function createServer(opts: ServerOptions) {
  const app = Fastify({ logger: true });

  if (isDatabaseEnabled()) {
    try {
      initDatabase();
      app.log.info("Database connection initialized");
    } catch (err) {
      app.log.warn(
        { err },
        "Database initialization failed - running without persistence",
      );
    }
  } else {
    app.log.info("DATABASE_URL not set - running without database persistence");
  }

  const eventBus = new EventBus();
  const runStatePath = process.env.UNDOABLE_RUN_STATE_FILE?.trim();
  const runManager = new RunManager(eventBus, {
    stateFilePath:
      runStatePath && runStatePath.length > 0 ? runStatePath : undefined,
  });
  const execRecovery = recoverExecRegistryState();
  if (
    execRecovery.runningRecovered > 0 ||
    execRecovery.finishedRecovered > 0 ||
    execRecovery.staleRunningDropped > 0
  ) {
    app.log.info(execRecovery, "recovered persisted exec sessions");
  }

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

  let executorDepsRef: {
    deps: import("../services/run-executor.js").RunExecutorDeps;
  } | null = null;
  let schedulerRegistryRef:
    | {
        registry: ReturnType<
          typeof import("../tools/index.js").createToolRegistry
        >;
      }
    | undefined;

  const storePath = path.join(os.homedir(), ".undoable", "scheduler-jobs.json");
  const cronRuns = new CronRunLogService();

  const SCHEDULED_JOB_SYSTEM_PROMPT = [
    "You are Undoable executing a SCHEDULED JOB. This is an automated task — not an interactive conversation.",
    "",
    "IMPORTANT RULES:",
    "1. Execute the instruction immediately using your tools. Do NOT ask clarifying questions.",
    "2. Do NOT greet the user or ask what they need. The instruction below is the complete task.",
    "3. Use your tools (exec, web_search, browser, browse_page, web_fetch, read_file, write_file, edit_file, media, sessions_*, channel actions, etc.) to accomplish the task.",
    "4. When done, return a concise summary of what you did and the results.",
    "5. If the task cannot be completed, explain why in your response.",
    "",
    "You have full access to the system. Act autonomously and complete the task.",
    "",
    "CONTEXT: This session is persistent across runs of this scheduled job.",
    "The conversation history above contains your previous executions.",
    "Use that context to avoid repeating work, track progress, and build on prior results.",
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
          jobId: job.id,
        });
        app.log.info(
          { jobId: job.id, runId: run.id, agentId },
          "scheduler: created run",
        );
        if (executorDepsRef) {
          try {
            const { executeRun } = await import("../services/run-executor.js");
            const registry =
              schedulerRegistryRef?.registry ?? executorDepsRef.deps.registry;
            await executeRun(run.id, job.payload.instruction, {
              ...executorDepsRef.deps,
              registry,
              systemPrompt: SCHEDULED_JOB_SYSTEM_PROMPT,
              sessionId: `cron-${job.id}`,
              maxIterations: 50,
            });
            const finalStatus = runManager.getById(run.id)?.status;
            if (finalStatus === "failed") {
              return {
                status: "error",
                error: "Run finished with failed status",
                runId: run.id,
              };
            }
            return { status: "ok", runId: run.id };
          } catch (err) {
            app.log.error(
              { runId: run.id, err },
              "scheduler: run execution failed",
            );
            return { status: "error", error: String(err), runId: run.id };
          }
        }
        return {
          status: "error",
          error: "Executor dependencies not available",
        };
      } else {
        app.log.info(
          { jobId: job.id, text: job.payload.text },
          "scheduler: system event",
        );
        return { status: "ok" };
      }
    },
    onEvent: (evt: SchedulerEvent) => {
      cronRuns.append(evt);
      app.log.info({ scheduler: evt }, "scheduler event");
    },
  });
  const swarmService = new SwarmService({ scheduler });
  await swarmService.reconcileJobs();

  const gatewayToken = process.env.UNDOABLE_TOKEN;
  app.addHook("onRequest", createGatewayAuthHook(gatewayToken));

  const canvasHost = await createCanvasHostHandler({
    rootDir: process.env.UNDOABLE_CANVAS_ROOT,
    basePath: CANVAS_HOST_PATH,
    liveReload:
      process.env.UNDOABLE_CANVAS_LIVE_RELOAD === "false" ? false : true,
    logError: (message) => app.log.error({ message }, "canvas host"),
  });
  if (canvasHost.rootDir) {
    app.log.info(
      { path: `${CANVAS_HOST_PATH}/`, rootDir: canvasHost.rootDir },
      "canvas host mounted",
    );
  }

  const handleCanvasRequest = async (
    req: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
  ) => {
    const handled = await canvasHost.handleHttpRequest(req.raw, reply.raw);
    if (!handled) {
      reply.code(404).send({ error: "Not Found" });
      return;
    }
    reply.hijack();
  };

  app.get(CANVAS_HOST_PATH, handleCanvasRequest);
  app.get(`${CANVAS_HOST_PATH}/*`, handleCanvasRequest);

  app.server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== CANVAS_WS_PATH) {
      return;
    }

    const identity = authorizeGatewayHeaders(req.headers, gatewayToken);
    if (!identity) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    const upgraded = canvasHost.handleUpgrade(req, socket, head);
    if (!upgraded) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  });

  const chatService = new ChatService();
  const runMode = resolveRunMode({
    mode: (process.env.UNDOABLE_RUN_MODE as RunMode | undefined) ?? undefined,
    maxIterations: process.env.UNDOABLE_MAX_ITERATIONS
      ? Number(process.env.UNDOABLE_MAX_ITERATIONS)
      : undefined,
    dangerouslySkipPermissions:
      process.env.UNDOABLE_DANGEROUSLY_SKIP_PERMISSIONS === "1",
  });
  const initialApiKey = process.env.OPENAI_API_KEY ?? "";
  const initialModel = process.env.UNDOABLE_MODEL ?? "gpt-4.1-mini";
  const initialBaseUrl =
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const chatConfig = {
    apiKey: initialApiKey,
    model: initialModel,
    baseUrl: initialBaseUrl,
    runMode,
  };
  const providerSvc = new ProviderService();
  await providerSvc.init(initialApiKey, initialModel, initialBaseUrl);
  app.log.info(
    {
      runMode: runMode.mode,
      maxIterations: runMode.maxIterations,
      skipPerms: runMode.dangerouslySkipPermissions,
      model: initialModel,
    },
    "run mode configured",
  );

  const skillsService = new SkillsService();
  const memorySvc = new MemoryService();
  await memorySvc.init();
  const wizardService = new WizardService();
  const execApprovalService = new ExecApprovalService();
  const nodeGatewayService = new NodeGatewayService();
  const connectorRegistry = new ConnectorRegistry();
  const sandboxExec = new SandboxExecService();
  const heartbeatSvc = new HeartbeatService();
  heartbeatSvc.start({
    onSessionDead: (id) =>
      app.log.info({ sessionId: id }, "session marked dead by heartbeat"),
  });
  const browserHeadless = process.env.UNDOABLE_BROWSER_HEADLESS === "true";
  const browserViewport = process.env.UNDOABLE_BROWSER_VIEWPORT
    ? (() => {
        const [w, h] = process.env
          .UNDOABLE_BROWSER_VIEWPORT!.split("x")
          .map(Number);
        return w && h ? { width: w, height: h } : undefined;
      })()
    : undefined;
  const browserSvc = await createBrowserService({
    headless: browserHeadless,
    viewport: browserViewport,
    userAgent: process.env.UNDOABLE_BROWSER_USER_AGENT || undefined,
    persistSession: process.env.UNDOABLE_BROWSER_PERSIST_SESSION === "true",
    launchArgs:
      process.env.UNDOABLE_BROWSER_ARGS?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [],
  });
  const canvasService = new CanvasService();

  const ttsService = new TtsService();
  const sttService = new SttService();

  const openaiConfig = providerSvc.getProviderConfig("openai");
  const openaiKey = openaiConfig?.apiKey || initialApiKey;
  const openaiBaseUrl = openaiConfig?.baseUrl || initialBaseUrl;
  if (openaiKey) {
    ttsService.setApiKey("openai", openaiKey);
    ttsService.setBaseUrl("openai", openaiBaseUrl);
    sttService.setApiKey("openai", openaiKey);
    sttService.setBaseUrl("openai", openaiBaseUrl);
  }
  if (process.env.ELEVENLABS_API_KEY) {
    ttsService.setApiKey("elevenlabs", process.env.ELEVENLABS_API_KEY);
  }
  if (process.env.DEEPGRAM_API_KEY) {
    sttService.setApiKey("deepgram", process.env.DEEPGRAM_API_KEY);
  }

  const usageService = new UsageService();
  await usageService.init();

  const { createToolRegistry } = await import("../tools/index.js");
  const { callLLM } = await import("../routes/chat.js");
  const runRegistry = createToolRegistry({
    runManager,
    scheduler,
    browserSvc,
    connectorRegistry,
    memoryService: memorySvc,
    canvasService,
    swarmService,
    sandboxExec,
    sandboxSessionId: "daemon",
    approvalMode: shouldAutoApprove(runMode) ? ("off" as const) : undefined,
    execApprovalService,
  });

  const boundCallLLM = (
    messages: unknown[],
    toolDefs: unknown[],
    stream: boolean,
  ) => {
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

  const mediaService = new MediaService();
  const mediaUnderstanding = new MediaUnderstandingService({
    callLLM: boundCallLLM,
    sttService,
  });

  const channelManager = new ChannelManager({
    chatService,
    eventBus,
    callLLM: boundCallLLM,
    registry: runRegistry,
    mediaService,
    mediaUnderstanding,
  });
  channelManager.register(createTelegramChannel());
  channelManager.register(createDiscordChannel());
  channelManager.register(createSlackChannel());
  channelManager.register(createWhatsAppChannel());

  const { createChannelTools } = await import("../tools/channel-tools.js");
  runRegistry.registerTools(createChannelTools(channelManager));

  const { createSessionTools } = await import("../tools/session-tools.js");
  runRegistry.registerTools(
    createSessionTools({
      chatService,
      runManager,
      eventBus,
      callLLM: boundCallLLM,
      registry: runRegistry,
    }),
  );

  const { createMediaTool } = await import("../tools/media-tools.js");
  runRegistry.registerTools([
    createMediaTool(mediaService, mediaUnderstanding),
  ]);

  const mediaCleanupInterval = setInterval(
    () => mediaService.cleanup().catch(() => {}),
    60 * 60 * 1000,
  );

  const pluginRegistry = new PluginRegistry();
  await pluginRegistry.loadAll();
  const pluginCtx: PluginContext = {
    registerTool: (tool) => runRegistry.registerTools([tool]),
    getService: <T>(name: string): T | undefined => {
      const services: Record<string, unknown> = {
        chat: chatService,
        media: mediaService,
        memory: memorySvc,
        provider: providerSvc,
        usage: usageService,
        tts: ttsService,
        stt: sttService,
      };
      return services[name] as T | undefined;
    },
    log: {
      info: (msg) => app.log.info({ plugin: true }, msg),
      error: (msg) => app.log.error({ plugin: true }, msg),
    },
  };
  await pluginRegistry.activateAll(pluginCtx);

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
  const swarmRegistry = createToolRegistry({
    runManager,
    scheduler,
    browserSvc,
    connectorRegistry,
    memoryService: memorySvc,
    canvasService,
    swarmService,
    sandboxExec,
    sandboxSessionId: "daemon",
    approvalMode: "off",
    execSecurityBypass: true,
  });
  schedulerRegistryRef = { registry: swarmRegistry };
  swarmRegistry.registerTools(createChannelTools(channelManager));
  swarmRegistry.registerTools(
    createSessionTools({
      chatService,
      runManager,
      eventBus,
      callLLM: boundCallLLM,
      registry: swarmRegistry,
    }),
  );
  swarmRegistry.registerTools([
    createMediaTool(mediaService, mediaUnderstanding),
  ]);

  const SWARM_NODE_SYSTEM_PROMPT = [
    "You are Undoable executing a SWARM WORKFLOW NODE. This is an automated task — not an interactive conversation.",
    "",
    "IMPORTANT RULES:",
    "1. Execute the instruction immediately using your tools. Do NOT ask clarifying questions.",
    "2. Do NOT greet the user or ask what they need. The instruction below is the complete task.",
    "3. Use your tools (exec, web_search, browser, browse_page, web_fetch, read_file, write_file, edit_file, media, sessions_*, channel actions, etc.) to accomplish the task.",
    "4. When done, return a concise summary of what you did and the results.",
    "5. If the task cannot be completed, explain why in your response.",
    "",
    "You have full access to the system. Act autonomously and complete the task.",
    "",
    "CONTEXT: This session is persistent across runs of this SWARM node.",
    "The conversation history above contains your previous executions.",
    "Use that context to avoid repeating work, track progress, and build on prior results.",
  ].join("\n");

  swarmRoutes(app, swarmService, runManager, {
    eventBus,
    executorDeps: {
      chatService,
      registry: swarmRegistry,
      providerService: providerSvc,
      callLLM: boundCallLLM,
      maxIterations: runMode.maxIterations ?? 50,
      systemPrompt: SWARM_NODE_SYSTEM_PROMPT,
    },
  });
  agentRoutes(app, agentRegistry, instructionsStore);
  instructionsRoutes(app, instructionsStore);
  voiceRoutes(app, ttsService, sttService);
  skillsRoutes(app, skillsService);
  heartbeatRoutes(app, heartbeatSvc);
  chatRoutes(
    app,
    chatService,
    chatConfig,
    runManager,
    scheduler,
    browserSvc,
    skillsService,
    providerSvc,
    agentRegistry,
    instructionsStore,
    memorySvc,
    sandboxExec,
    heartbeatSvc,
    swarmService,
    usageService,
  );
  fileRoutes(app);
  channelRoutes(app, channelManager);
  sessionRoutes(app, chatService);
  const { usageRoutes } = await import("../routes/usage.js");
  usageRoutes(app, usageService);
  pluginRoutes(app, pluginRegistry, pluginCtx);
  gatewayRoutes(app, {
    scheduler,
    cronRuns,
    chatService,
    heartbeatService: heartbeatSvc,
    wizardService,
    skillsService,
    channelManager,
    browserService: browserSvc,
    providerService: providerSvc,
    execApprovalService,
    nodeGatewayService,
    connectorRegistry,
    agentRegistry,
    instructionsStore,
    ttsService,
    usageService,
  });

  return {
    start: async () => {
      await scheduler.start();
      await channelManager.startAll();
      const host = opts.host ?? "127.0.0.1";
      await app.listen({ port: opts.port, host });
    },
    stop: async () => {
      clearInterval(mediaCleanupInterval);
      scheduler.stop();
      heartbeatSvc.stop();
      await usageService.destroy();
      for (const p of pluginRegistry.list().filter((x) => x.active)) {
        await pluginRegistry.deactivate(p.name).catch(() => {});
      }
      await channelManager.stopAll();
      await providerSvc.destroy();
      await canvasHost.close();
      await browserSvc.close();
      await app.close();
    },
    app,
  };
}
