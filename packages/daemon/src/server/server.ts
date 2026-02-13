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
import { userRoutes } from "../routes/users.js";
import { agentRoutes } from "../routes/agents.js";
import { voiceRoutes } from "../routes/voice.js";
import { RunManager } from "../services/run-manager.js";
import { AuditService } from "../services/audit-service.js";
import { UserService } from "../services/user-service.js";
import { ChatService } from "../services/chat-service.js";
import { createBrowserService } from "../services/browser-service.js";
import { SkillsService } from "../services/skills-service.js";
import { skillsRoutes } from "../routes/skills.js";
import type { AuthUser } from "../auth/types.js";
import { resolveRunMode, type RunMode } from "../actions/run-mode.js";

export type ServerOptions = {
  port: number;
  host?: string;
};

const DEV_USER: AuthUser = { id: "dev", username: "dev", role: "admin" };

export async function createServer(opts: ServerOptions) {
  const app = Fastify({ logger: true });

  const eventBus = new EventBus();
  const runManager = new RunManager(eventBus);
  const auditService = new AuditService();
  const userService = new UserService();
  const agentRegistry = new AgentRegistry();

  const storePath = path.join(os.homedir(), ".undoable", "scheduler-jobs.json");
  const scheduler = new SchedulerService({
    config: { enabled: true, storePath },
    executor: async (job) => {
      if (job.payload.kind === "run") {
        const run = runManager.create({
          userId: "scheduler",
          agentId: "default",
          instruction: job.payload.instruction,
        });
        app.log.info({ jobId: job.id, runId: run.id }, "scheduler: created run");
      } else {
        app.log.info({ jobId: job.id, text: job.payload.text }, "scheduler: system event");
      }
      return { status: "ok" };
    },
    onEvent: (evt: SchedulerEvent) => {
      app.log.info({ scheduler: evt }, "scheduler event");
    },
  });

  app.addHook("onRequest", async (req) => {
    (req as typeof req & { user: AuthUser }).user = DEV_USER;
  });

  const chatService = new ChatService();
  const runMode = resolveRunMode({
    mode: (process.env.UNDOABLE_RUN_MODE as RunMode | undefined) ?? undefined,
    maxIterations: process.env.UNDOABLE_MAX_ITERATIONS ? Number(process.env.UNDOABLE_MAX_ITERATIONS) : undefined,
    dangerouslySkipPermissions: process.env.UNDOABLE_DANGEROUSLY_SKIP_PERMISSIONS === "1",
  });
  const chatConfig = {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    model: process.env.UNDOABLE_MODEL ?? "gpt-4.1-mini",
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    runMode,
  };
  app.log.info({ runMode: runMode.mode, maxIterations: runMode.maxIterations, skipPerms: runMode.dangerouslySkipPermissions }, "run mode configured");

  await app.register(healthRoutes);
  runRoutes(app, runManager, auditService);
  eventRoutes(app, eventBus, runManager);
  jobRoutes(app, scheduler);
  userRoutes(app, userService, auditService);
  agentRoutes(app, agentRegistry);
  voiceRoutes(app, { apiKey: chatConfig.apiKey, baseUrl: chatConfig.baseUrl });
  const skillsService = new SkillsService();
  skillsRoutes(app, skillsService);
  const browserSvc = await createBrowserService();
  chatRoutes(app, chatService, chatConfig, runManager, scheduler, browserSvc, skillsService);

  return {
    start: async () => {
      await scheduler.start();
      const host = opts.host ?? "127.0.0.1";
      await app.listen({ port: opts.port, host });
    },
    stop: async () => {
      scheduler.stop();
      await browserSvc.close();
      await app.close();
    },
    app,
  };
}
