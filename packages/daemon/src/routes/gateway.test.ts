import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import type { JobCreate, JobPatch, ScheduledJob } from "@undoable/core";
import { DEFAULT_CONFIG } from "@undoable/core";
import type { ChannelId } from "../channels/types.js";
import type { ConnectorConfig } from "../connectors/types.js";
import { gatewayRoutes } from "./gateway.js";

describe("gateway routes", () => {
  const app = Fastify();

  const jobs: ScheduledJob[] = [
    {
      id: "job-1",
      name: "Daily check",
      description: "",
      enabled: true,
      createdAtMs: 1,
      updatedAtMs: 1,
      schedule: { kind: "every", everyMs: 60_000 },
      payload: { kind: "event", text: "ping" },
      state: {},
    },
  ];

  const scheduler = {
    status: async () => ({ enabled: true, storePath: "/tmp/jobs.json", jobCount: 0, nextWakeAtMs: null }),
    list: async ({ includeDisabled }: { includeDisabled?: boolean } = {}) =>
      includeDisabled ? [...jobs] : jobs.filter((job) => job.enabled),
    add: async (input: JobCreate) => {
      const created: ScheduledJob = {
        ...input,
        id: `job-${jobs.length + 1}`,
        createdAtMs: 1,
        updatedAtMs: 1,
        state: {},
      };
      jobs.push(created);
      return created;
    },
    update: async (id: string, patch: JobPatch) => {
      const existing = jobs.find((job) => job.id === id);
      if (!existing) throw new Error("unknown job id");
      const updated: ScheduledJob = {
        ...existing,
        ...patch,
        state: { ...existing.state, ...patch.state },
      };
      const index = jobs.findIndex((job) => job.id === id);
      jobs[index] = updated;
      return updated;
    },
    remove: async (id: string) => {
      const index = jobs.findIndex((job) => job.id === id);
      if (index < 0) return false;
      jobs.splice(index, 1);
      return true;
    },
    run: async (id: string) => jobs.some((job) => job.id === id),
  };

  const cronRuns = {
    list: (jobId: string, limit = 20) => [{ jobId, runAtMs: 10, status: "ok" as const }].slice(0, limit),
  };

  const skills = [
    {
      name: "demo-skill",
      description: "demo",
      filePath: "/tmp/skills/demo-skill/SKILL.md",
      baseDir: "/tmp/skills/demo-skill",
      source: "user" as const,
      body: "# demo",
      eligible: true,
      disabled: false,
      missing: { bins: [], env: [] },
      requires: { bins: ["git"] },
    },
  ];

  const skillsService = {
    list: () => skills,
    bins: () => ["git"],
    getDangerWarning: () => ({
      title: "Third-party skills can be dangerous",
      message: "review before use",
      docs: ["https://skills.sh/docs"],
    }),
    searchRegistry: async (query?: string) => ({
      ok: true,
      query: query ?? "",
      warning: {
        title: "Third-party skills can be dangerous",
        message: "review before use",
        docs: ["https://skills.sh/docs"],
      },
      results: [
        {
          reference: "vercel-labs/skills@find-skills",
          repo: "vercel-labs/skills",
          skill: "find-skills",
          url: "https://skills.sh/vercel-labs/skills/find-skills",
          installCommand: "npx skills add vercel-labs/skills --skill find-skills -g -y",
          recommended: true,
        },
      ],
    }),
    installFromRegistry: async (reference: string) => ({
      ok: true,
      installed: true,
      reference,
      message: `installed ${reference}`,
      warning: {
        title: "Third-party skills can be dangerous",
        message: "review before use",
        docs: ["https://skills.sh/docs"],
      },
    }),
    toggle: (_name: string, enabled: boolean) => {
      const current = skills[0];
      if (!current) return false;
      current.disabled = !enabled;
      current.eligible = enabled;
      return true;
    },
    getByName: (name: string) => skills.find((skill) => skill.name === name),
  };

  const channelState: Record<string, {
    config: { channelId: "telegram" | "discord"; enabled: boolean; token?: string };
    status: { channelId: "telegram" | "discord"; connected: boolean; accountName?: string; error?: string };
  }> = {
    telegram: {
      config: { channelId: "telegram" as const, enabled: true, token: "token-1" },
      status: { channelId: "telegram" as const, connected: true, accountName: "Telegram Bot" },
    },
    discord: {
      config: { channelId: "discord" as const, enabled: false },
      status: { channelId: "discord" as const, connected: false, error: "not configured" },
    },
  };

  const agents = new Map<string, {
    id: string;
    name?: string;
    model: string;
    identity?: unknown;
    skills?: string[];
    sandbox?: unknown;
    default?: boolean;
  }>([["default", {
    id: "default",
    name: "Default",
    model: "gpt-4.1-mini",
    identity: "You are Default",
    skills: [],
    sandbox: { docker: false, network: true, browser: true },
    default: true,
  }]]);

  const agentRegistry = {
    list: () => [...agents.values()],
    get: (id: string) => agents.get(id),
    getDefaultId: () => "default",
    register: (config: { id: string; name?: string; model: string; skills?: string[]; sandbox?: unknown; default?: boolean }) => {
      agents.set(config.id, { ...config });
    },
    update: (id: string, patch: Record<string, unknown>) => {
      const current = agents.get(id);
      if (!current) return undefined;
      const updated = { ...current, ...patch, id };
      agents.set(id, updated);
      return updated;
    },
    remove: (id: string) => agents.delete(id),
  };

  const instructionByAgent = new Map<string, string>();
  const instructionsStore = {
    getCurrent: async (agentId: string) => instructionByAgent.get(agentId) ?? null,
    save: async (agentId: string, content: string) => {
      instructionByAgent.set(agentId, content);
      return 1;
    },
    deleteAll: async (agentId: string) => {
      instructionByAgent.delete(agentId);
    },
  };

  const channelManager = {
    listAll: () => Object.values(channelState),
    getStatus: (channelId: string) => channelState[channelId as keyof typeof channelState],
    updateConfig: async (channelId: string, patch: Record<string, unknown>) => {
      const row = channelState[channelId as keyof typeof channelState];
      if (!row) throw new Error("unknown channel");
      row.config = {
        ...row.config,
        enabled: typeof patch.enabled === "boolean" ? patch.enabled : row.config.enabled,
        token: typeof patch.token === "string" ? patch.token : row.config.token,
      };
      return row.config;
    },
    stopChannel: async (_channelId: string) => { },
    probeChannel: async (channelId: ChannelId) => ({
      channelId,
      probedAt: Date.now(),
      connected: channelState[channelId as keyof typeof channelState]?.status.connected ?? false,
      ok: true,
      checks: [{ name: "mock_probe", ok: true, severity: "info" as const, message: "ok" }],
    }),
    listCapabilities: (channelId?: ChannelId) => {
      const all: Array<{
        channelId: ChannelId;
        name: string;
        auth: string[];
        supports: string[];
        toolActions: string[];
        notes: string[];
      }> = [
        {
          channelId: "telegram",
          name: "Telegram",
          auth: ["bot_token"],
          supports: ["dm", "groups"],
          toolActions: ["send_message"],
          notes: ["mock"],
        },
        {
          channelId: "discord",
          name: "Discord",
          auth: ["bot_token"],
          supports: ["dm", "groups"],
          toolActions: ["send_message"],
          notes: ["mock"],
        },
      ];
      return channelId ? all.filter((entry) => entry.channelId === channelId) : all;
    },
    listLogs: (channelId?: ChannelId, limit = 200) =>
      [{ id: "log-1", ts: Date.now(), channelId: "telegram" as ChannelId, level: "info" as const, event: "test", message: "hello" }]
        .filter((entry) => !channelId || entry.channelId === channelId)
        .slice(0, limit),
    resolveTargets: async (_channelId: ChannelId, entries: string[]) =>
      entries.map((entry) => ({ input: entry, resolved: entry, type: "user" as const, confidence: "high" as const })),
    listPairing: (_channelId?: ChannelId) => ({
      pending: [
        {
          requestId: "req-1",
          channelId: "telegram" as ChannelId,
          userId: "u-1",
          chatId: "c-1",
          code: "ABC123",
          status: "pending" as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          promptCount: 1,
        },
      ],
      approved: [
        {
          channelId: "telegram" as ChannelId,
          userId: "u-2",
          approvedAt: Date.now(),
          requestId: "req-0",
        },
      ],
      recent: [],
    }),
    approvePairing: (_params: { requestId?: string; channelId?: ChannelId; code?: string; approvedBy?: string }) =>
      ({ ok: true, request: { requestId: "req-1", channelId: "telegram" as ChannelId, userId: "u-1", chatId: "c-1", code: "ABC123", status: "approved" as const, createdAt: Date.now(), updatedAt: Date.now(), promptCount: 1 }, approval: { channelId: "telegram" as ChannelId, userId: "u-1", approvedAt: Date.now(), requestId: "req-1" } }),
    rejectPairing: (_params: { requestId?: string; channelId?: ChannelId; code?: string; rejectedBy?: string }) =>
      ({ ok: true, request: { requestId: "req-1", channelId: "telegram" as ChannelId, userId: "u-1", chatId: "c-1", code: "ABC123", status: "rejected" as const, createdAt: Date.now(), updatedAt: Date.now(), promptCount: 1 } }),
    revokePairing: (_channelId: ChannelId, _userId: string) => ({ ok: true, removed: { channelId: "telegram" as ChannelId, userId: "u-2", approvedAt: Date.now() } }),
  };

  let headless = true;
  const browserService = {
    navigate: async (url: string) => `navigated:${url}`,
    click: async (selector: string) => `clicked:${selector}`,
    type: async (selector: string, text: string) => `typed:${selector}:${text}`,
    screenshot: async () => "base64-image",
    evaluate: async (script: string) => `eval:${script}`,
    getText: async () => "page text",
    tabs: async () => [{ index: 0, url: "https://example.com", title: "Example", active: true }],
    openTab: async (url?: string) => ({ index: 1, url: url ?? "", title: "New", active: true }),
    closeTab: async (index: number) => `closed:${index}`,
    focusTab: async (index: number) => `focused:${index}`,
    snapshot: async () => ({ role: "document", name: "root" }),
    pdf: async (outputPath?: string) => outputPath ?? "/tmp/page.pdf",
    armDialog: async (accept: boolean) => (accept ? "accepted" : "dismissed"),
    uploadFile: async (_selector: string, paths: string[]) => `uploaded:${paths.length}`,
    waitForSelector: async (selector: string) => `waited:${selector}`,
    scroll: async (x: number, y: number) => `scrolled:${x},${y}`,
    setHeadless: async (value: boolean) => { headless = value; },
    isHeadless: () => headless,
  };

  const approvalPending = new Map<string, { decision?: "allow-once" | "allow-always" | "deny" }>();
  const execApprovalService = {
    create: (
      _request: Record<string, unknown>,
      timeoutMs = 120_000,
      explicitId?: string,
    ) => {
      const id = explicitId ?? `approval-${approvalPending.size + 1}`;
      approvalPending.set(id, {});
      return {
        id,
        request: { command: "test" },
        createdAtMs: 1,
        expiresAtMs: 1 + timeoutMs,
      };
    },
    waitForDecision: async (id: string) => {
      const pending = approvalPending.get(id);
      if (!pending) throw new Error("unknown approval id");
      return pending.decision ?? "deny";
    },
    resolve: (id: string, decision: "allow-once" | "allow-always" | "deny") => {
      const pending = approvalPending.get(id);
      if (!pending) return false;
      pending.decision = decision;
      return true;
    },
    getSnapshot: (id: string) => (approvalPending.has(id) ? { id, request: { command: "test" }, createdAtMs: 1, expiresAtMs: 2 } : null),
  };

  const pairRequests = new Map<string, { requestId: string; nodeId: string; connector?: ConnectorConfig }>();
  const pairedNodes = new Map<string, { nodeId: string; displayName?: string; platform?: string; token: string; caps: string[]; commands: string[]; pairedAtMs: number }>();
  const connectedNodes = new Map<string, { nodeId: string; displayName: string; platform: string; capabilities: string[]; commands: string[]; connected: boolean; connectedAt: number }>();

  const nodeGatewayService = {
    requestPairing: (input: { nodeId: string; displayName?: string; platform?: string; caps?: string[]; commands?: string[]; connector?: ConnectorConfig }) => {
      const requestId = `req-${pairRequests.size + 1}`;
      const request = {
        requestId,
        nodeId: input.nodeId,
        displayName: input.displayName,
        platform: input.platform,
        caps: input.caps ?? [],
        commands: input.commands ?? [],
        connector: input.connector,
        createdAtMs: 1,
      };
      pairRequests.set(requestId, { requestId, nodeId: input.nodeId, connector: input.connector });
      return { status: "pending" as const, created: true, request };
    },
    listPairing: () => ({
      requests: [...pairRequests.values()].map((req) => ({ ...req, createdAtMs: 1 })),
      paired: [...pairedNodes.values()],
    }),
    approvePairing: (requestId: string) => {
      const req = pairRequests.get(requestId);
      if (!req) return null;
      pairRequests.delete(requestId);
      const node = {
        nodeId: req.nodeId,
        displayName: "Paired Node",
        platform: "linux",
        caps: ["exec"],
        commands: ["system.info"],
        token: "token-abc",
        pairedAtMs: 1,
      };
      pairedNodes.set(node.nodeId, node);
      return { requestId, node, connector: req.connector };
    },
    rejectPairing: (requestId: string) => {
      const req = pairRequests.get(requestId);
      if (!req) return null;
      pairRequests.delete(requestId);
      return { requestId, nodeId: req.nodeId };
    },
    verifyToken: (nodeId: string, token: string) => ({ ok: pairedNodes.get(nodeId)?.token === token, nodeId }),
    renameNode: (nodeId: string, displayName: string) => {
      const node = pairedNodes.get(nodeId);
      if (!node) return null;
      node.displayName = displayName;
      return { nodeId, displayName };
    },
    rotateToken: (nodeId: string) => {
      const node = pairedNodes.get(nodeId);
      if (!node) return null;
      node.token = "token-rotated";
      return { nodeId, token: node.token };
    },
    revokeToken: (nodeId: string) => {
      const node = pairedNodes.get(nodeId);
      if (!node) return null;
      node.token = "";
      return { nodeId, revoked: true };
    },
    getPaired: (nodeId: string) => pairedNodes.get(nodeId) ?? null,
    recordInvokeResult: (_input: unknown) => { },
    recordNodeEvent: (_input: unknown) => { },
  };

  const connectorRegistry = {
    add: async (config: ConnectorConfig) => {
      const nodeId = `node-${connectedNodes.size + 1}`;
      const info = {
        nodeId,
        displayName: config.displayName ?? "Connected Node",
        platform: "linux",
        capabilities: ["exec", "fs"],
        commands: ["system.info", "system.run"],
        connected: true,
        connectedAt: Date.now(),
      };
      connectedNodes.set(nodeId, info);
      return {
        info: () => info,
      };
    },
    get: (nodeId: string) => {
      const info = connectedNodes.get(nodeId);
      return info
        ? {
          info: () => info,
        }
        : undefined;
    },
    listConnected: () => [...connectedNodes.values()],
    invoke: async (nodeId: string, command: string) => {
      if (!connectedNodes.has(nodeId)) throw new Error("Node not found");
      return { ok: true, payload: { command, nodeId } };
    },
  };

  const chatService = {
    getHistory: async (sessionId: string) => [{ role: "user" as const, content: `hello:${sessionId}` }],
    listSessions: async () => [{
      id: "default",
      title: "Default session",
      agentId: "default",
      createdAt: 1,
      updatedAt: 2,
      messageCount: 1,
      preview: "hello:default",
    }],
    loadSession: async (sessionId: string) => (sessionId === "default"
      ? {
        id: "default",
        title: "Default session",
        agentId: "default",
        createdAt: 1,
        updatedAt: 2,
        messages: [{ role: "user" as const, content: "hello:default" }],
      }
      : null),
    renameSession: async (sessionId: string, title: string) => sessionId === "default" && !!title,
    resetSession: async (sessionId: string) => sessionId === "default",
    deleteSession: async (sessionId: string) => sessionId === "default",
    addUserMessage: async (sessionId: string, content: string) => ({
      id: sessionId,
      title: "Default session",
      agentId: "default",
      messages: [{ role: "user" as const, content }],
      createdAt: 1,
      updatedAt: 2,
    }),
  };

  const heartbeatService = {
    listSessions: () => [{
      sessionId: "default",
      health: "alive" as const,
      lastHeartbeatAt: 100,
      lastActivityAt: 100,
      connectedAt: 50,
      sseActive: true,
      agentId: "default",
    }],
    ping: (sessionId: string) => (sessionId === "default" ? "alive" as const : "dead" as const),
    getHealth: (sessionId: string) => (sessionId === "default" ? "alive" as const : "dead" as const),
    activeCount: 1,
  };

  const providerService = {
    listAllModels: () => [{ id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai", contextWindow: 128000 }],
    getActiveConfig: () => ({ provider: "openai", model: "gpt-4.1-mini" }),
  };

  const wizardService = {
    start: async () => ({ sessionId: "session-1", done: false as const, step: { id: "userName" as const, prompt: "What should I call you?" }, progress: { current: 1, total: 5 } }),
    next: async (sessionId: string) => ({ done: false as const, step: { id: "botName" as const, prompt: `next:${sessionId}` }, progress: { current: 2, total: 5 } }),
    cancel: (sessionId: string) => ({ status: "cancelled" as const, sessionId }),
    status: () => ({ status: "running" as const }),
  };

  beforeAll(async () => {
    gatewayRoutes(app, {
      scheduler,
      cronRuns,
      chatService,
      heartbeatService,
      wizardService,
      skillsService,
      channelManager,
      browserService,
      providerService,
      execApprovalService,
      nodeGatewayService,
      connectorRegistry,
      agentRegistry,
      instructionsStore,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns method not found for unknown methods", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "unknown.method", params: {} },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: false,
      error: {
        code: "METHOD_NOT_FOUND",
        message: "Unknown method: unknown.method",
      },
    });
  });

  it("handles wizard.start", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "wizard.start", params: {} },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.sessionId).toBe("session-1");
    expect(body.result.step.id).toBe("userName");
  });

  it("handles chat.history with default session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "chat.history", params: {} },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.sessionId).toBe("default");
    expect(body.result.messages[0].content).toBe("hello:default");
  });

  it("handles cron.list", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "cron.list", params: {} },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.jobs.length).toBeGreaterThan(0);
  });

  it("handles usage.status and usage.cost", async () => {
    const status = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "usage.status", params: {} },
    });
    const statusBody = status.json();
    expect(status.statusCode).toBe(200);
    expect(statusBody.ok).toBe(true);
    expect(typeof statusBody.result.totalCalls).toBe("number");

    const cost = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "usage.cost", params: { days: 7 } },
    });
    const costBody = cost.json();
    expect(cost.statusCode).toBe(200);
    expect(costBody.ok).toBe(true);
    expect(costBody.result.days).toBe(7);
  });

  it("handles tts status/providers/enable/disable/setProvider/convert", async () => {
    const status0 = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "tts.status", params: {} },
    });
    const status0Body = status0.json();
    expect(status0Body.ok).toBe(true);
    expect(status0Body.result.enabled).toBe(false);

    const setProvider = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "tts.setProvider", params: { provider: "openai-tts" } },
    });
    const setProviderBody = setProvider.json();
    expect(setProviderBody.ok).toBe(true);
    expect(setProviderBody.result.provider).toBe("openai-tts");

    const providers = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "tts.providers", params: {} },
    });
    const providersBody = providers.json();
    expect(providersBody.ok).toBe(true);
    expect(providersBody.result.providers).toContain("openai-tts");

    const enabled = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "tts.enable", params: {} },
    });
    const enabledBody = enabled.json();
    expect(enabledBody.ok).toBe(true);
    expect(enabledBody.result.enabled).toBe(true);

    const converted = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "tts.convert", params: { text: "hello", format: "mp3" } },
    });
    const convertedBody = converted.json();
    expect(convertedBody.ok).toBe(true);
    expect(convertedBody.result.format).toBe("mp3");
    expect(typeof convertedBody.result.audioBase64).toBe("string");

    const disabled = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "tts.disable", params: {} },
    });
    const disabledBody = disabled.json();
    expect(disabledBody.ok).toBe(true);
    expect(disabledBody.result.enabled).toBe(false);
  });

  it("handles logs.tail", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "logs.tail", params: { limit: 5 } },
    });
    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.result.logs)).toBe(true);
  });

  it("handles exec.approvals get/set and node get/set", async () => {
    const set = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "exec.approvals.set", params: { mode: "always", allowlist: ["git status"] } },
    });
    const setBody = set.json();
    expect(setBody.ok).toBe(true);
    expect(setBody.result.mode).toBe("always");

    const get = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "exec.approvals.get", params: {} },
    });
    const getBody = get.json();
    expect(getBody.ok).toBe(true);
    expect(getBody.result.allowlist).toEqual(["git status"]);

    const nodeSet = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "exec.approvals.node.set", params: { nodeId: "device-1", mode: "mutate", allowlist: ["ls"] } },
    });
    const nodeSetBody = nodeSet.json();
    expect(nodeSetBody.ok).toBe(true);
    expect(nodeSetBody.result.nodeId).toBe("device-1");

    const nodeGet = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "exec.approvals.node.get", params: { nodeId: "device-1" } },
    });
    const nodeGetBody = nodeGet.json();
    expect(nodeGetBody.ok).toBe(true);
    expect(nodeGetBody.result.allowlist).toEqual(["ls"]);
  });

  it("handles talk.mode, models.list and update.run", async () => {
    const talk = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "talk.mode", params: { mode: "agent" } },
    });
    const talkBody = talk.json();
    expect(talkBody.ok).toBe(true);
    expect(talkBody.result.mode).toBe("agent");

    const models = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "models.list", params: {} },
    });
    const modelsBody = models.json();
    expect(modelsBody.ok).toBe(true);
    expect(modelsBody.result.active.provider).toBe("openai");
    expect(modelsBody.result.models[0].id).toBe("gpt-4.1-mini");

    const update = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "update.run", params: {} },
    });
    const updateBody = update.json();
    expect(updateBody.ok).toBe(true);
    expect(updateBody.result.started).toBe(true);
  });

  it("handles agents lifecycle and files methods", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: {
        method: "agents.create",
        params: {
          id: "worker-1",
          model: "gpt-4.1-mini",
          instructions: "Be concise",
          skills: ["demo-skill"],
        },
      },
    });
    const createdBody = created.json();
    expect(createdBody.ok).toBe(true);
    expect(createdBody.result.id).toBe("worker-1");

    const list = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "agents.list", params: {} },
    });
    const listBody = list.json();
    expect(listBody.ok).toBe(true);
    expect(listBody.result.agents.some((a: { id: string }) => a.id === "worker-1")).toBe(true);

    const updated = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: {
        method: "agents.update",
        params: { id: "worker-1", name: "Worker One", instructions: "Updated instructions" },
      },
    });
    const updatedBody = updated.json();
    expect(updatedBody.ok).toBe(true);
    expect(updatedBody.result.name).toBe("Worker One");

    const filesList = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "agents.files.list", params: { agentId: "worker-1" } },
    });
    const filesListBody = filesList.json();
    expect(filesListBody.ok).toBe(true);
    expect(filesListBody.result.files[0].path).toBe("instructions.md");

    const fileSet = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "agents.files.set", params: { agentId: "worker-1", content: "from file api" } },
    });
    const fileSetBody = fileSet.json();
    expect(fileSetBody.ok).toBe(true);
    expect(fileSetBody.result.version).toBe(1);

    const fileGet = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "agents.files.get", params: { agentId: "worker-1" } },
    });
    const fileGetBody = fileGet.json();
    expect(fileGetBody.ok).toBe(true);
    expect(fileGetBody.result.content).toBe("from file api");

    const deleted = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "agents.delete", params: { id: "worker-1" } },
    });
    const deletedBody = deleted.json();
    expect(deletedBody.ok).toBe(true);
    expect(deletedBody.result.deleted).toBe(true);
  });

  it("handles sessions.list/preview/patch/reset", async () => {
    const list = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "sessions.list", params: {} },
    });
    const listBody = list.json();
    expect(listBody.ok).toBe(true);
    expect(listBody.result.sessions[0].id).toBe("default");

    const preview = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "sessions.preview", params: { sessionId: "default" } },
    });
    const previewBody = preview.json();
    expect(previewBody.ok).toBe(true);
    expect(previewBody.result.id).toBe("default");

    const patch = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "sessions.patch", params: { sessionId: "default", title: "Renamed" } },
    });
    const patchBody = patch.json();
    expect(patchBody.ok).toBe(true);
    expect(patchBody.result.ok).toBe(true);

    const reset = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "sessions.reset", params: { sessionId: "default" } },
    });
    const resetBody = reset.json();
    expect(resetBody.ok).toBe(true);
    expect(resetBody.result.ok).toBe(true);
  });

  it("handles sessions.delete and sessions.compact", async () => {
    const deleted = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "sessions.delete", params: { sessionId: "default" } },
    });
    const deletedBody = deleted.json();
    expect(deletedBody.ok).toBe(true);
    expect(deletedBody.result.deleted).toBe(true);

    const compact = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "sessions.compact", params: {} },
    });
    const compactBody = compact.json();
    expect(compactBody.ok).toBe(true);
    expect(compactBody.result.ok).toBe(true);
  });

  it("handles last-heartbeat, set-heartbeats and system-presence/event", async () => {
    const last = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "last-heartbeat", params: { sessionId: "default" } },
    });
    const lastBody = last.json();
    expect(lastBody.ok).toBe(true);
    expect(lastBody.result.health).toBe("alive");

    const set = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "set-heartbeats", params: { sessionIds: ["default"] } },
    });
    const setBody = set.json();
    expect(setBody.ok).toBe(true);
    expect(setBody.result.updated[0].health).toBe("alive");

    const presence = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "system-presence", params: {} },
    });
    const presenceBody = presence.json();
    expect(presenceBody.ok).toBe(true);
    expect(presenceBody.result.activeCount).toBe(1);

    const event = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "system-event", params: { event: "tick" } },
    });
    const eventBody = event.json();
    expect(eventBody.ok).toBe(true);
    expect(eventBody.result.ok).toBe(true);
  });

  it("handles config.get/set/patch/schema", async () => {
    const schema = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "config.schema", params: {} },
    });
    const schemaBody = schema.json();
    expect(schemaBody.ok).toBe(true);
    expect(schemaBody.result.default.daemon.port).toBe(DEFAULT_CONFIG.daemon.port);

    const setResp = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "config.set", params: { key: "daemon.port", value: 7444 } },
    });
    const setBody = setResp.json();
    expect(setBody.ok).toBe(true);
    expect(setBody.result.value).toBe(7444);

    const getResp = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "config.get", params: { key: "daemon.port" } },
    });
    const getBody = getResp.json();
    expect(getBody.ok).toBe(true);
    expect(getBody.result.value).toBe(7444);

    const patchResp = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "config.patch", params: { patch: { logging: { level: "debug" } } } },
    });
    const patchBody = patchResp.json();
    expect(patchBody.ok).toBe(true);
    expect(patchBody.result.config.logging.level).toBe("debug");
  });

  it("handles voicewake.get/set", async () => {
    const setResp = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "voicewake.set", params: { enabled: true, phrase: "hey undoable", sensitivity: 0.7 } },
    });
    const setBody = setResp.json();
    expect(setBody.ok).toBe(true);
    expect(setBody.result.enabled).toBe(true);

    const getResp = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "voicewake.get", params: {} },
    });
    const getBody = getResp.json();
    expect(getBody.ok).toBe(true);
    expect(getBody.result.enabled).toBe(true);
    expect(getBody.result.sensitivity).toBe(0.7);
  });

  it("handles agent.identity.get", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "agent.identity.get", params: {} },
    });
    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.agentId).toBe("default");
    expect(body.result.model).toBe("gpt-4.1-mini");
  });

  it("handles chat.send and chat.abort", async () => {
    const sent = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "chat.send", params: { sessionId: "default", text: "hello" } },
    });
    const sentBody = sent.json();
    expect(sentBody.ok).toBe(true);
    expect(sentBody.result.accepted).toBe(true);

    const aborted = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "chat.abort", params: { sessionId: "default" } },
    });
    const abortedBody = aborted.json();
    expect(abortedBody.ok).toBe(true);
    expect(abortedBody.result.aborted).toBe(true);
  });

  it("handles send, agent and agent.wait", async () => {
    const send = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "send", params: { channel: "telegram", text: "hello" } },
    });
    const sendBody = send.json();
    expect(sendBody.ok).toBe(true);
    expect(sendBody.result.ok).toBe(true);

    const agent = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "agent", params: { agentId: "default", input: "do something", sessionId: "default" } },
    });
    const agentBody = agent.json();
    expect(agentBody.ok).toBe(true);
    expect(agentBody.result.agentId).toBe("default");

    const wait = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "agent.wait", params: { sessionId: "default" } },
    });
    const waitBody = wait.json();
    expect(waitBody.ok).toBe(true);
    expect(waitBody.result.sessionId).toBe("default");
  });

  it("handles wake", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "wake", params: { mode: "now", text: "wake up" } },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.mode).toBe("now");
    expect(body.result.attempted).toBeGreaterThan(0);
  });

  it("handles cron.runs", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "cron.runs", params: { id: "job-1", limit: 1 } },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.entries).toHaveLength(1);
    expect(body.result.entries[0].jobId).toBe("job-1");
  });

  it("handles skills.status", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "skills.status", params: {} },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.total).toBe(1);
    expect(body.result.warning.title).toContain("dangerous");
    expect(body.result.skills[0].name).toBe("demo-skill");
  });

  it("handles skills.search", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "skills.search", params: { query: "deployment" } },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
    expect(body.result.results[0].reference).toBe("vercel-labs/skills@find-skills");
  });

  it("handles skills.bins", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "skills.bins", params: {} },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.bins).toEqual(["git"]);
  });

  it("handles skills.install", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "skills.install", params: { reference: "vercel-labs/skills@find-skills" } },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.installed).toBe(true);
  });

  it("handles skills.update", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "skills.update", params: { skillKey: "demo-skill", enabled: false } },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.enabled).toBe(false);
  });

  it("handles channels.status", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "channels.status", params: {} },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.channelOrder).toContain("telegram");
    expect(body.result.channels.telegram.connected).toBe(true);
    expect(body.result.channelAccounts.telegram[0].accountId).toBe("default");
  });

  it("handles channels.logout", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "channels.logout", params: { channel: "telegram" } },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.channel).toBe("telegram");
    expect(body.result.cleared).toBe(true);
  });

  it("handles channels.probe", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "channels.probe", params: { deep: true } },
    });
    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.channelOrder).toContain("telegram");
    expect(body.result.probes.telegram.ok).toBe(true);
  });

  it("handles channels.capabilities", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "channels.capabilities", params: {} },
    });
    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.channelOrder).toContain("telegram");
    expect(body.result.capabilities.telegram.name).toBe("Telegram");
  });

  it("handles channels.logs", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "channels.logs", params: { channel: "telegram", limit: 20 } },
    });
    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.channel).toBe("telegram");
    expect(body.result.logs.length).toBeGreaterThan(0);
  });

  it("handles channels.resolve", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "channels.resolve", params: { channel: "telegram", entries: ["@demo"] } },
    });
    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.channel).toBe("telegram");
    expect(body.result.resolved[0].resolved).toBe("@demo");
  });

  it("handles channel pairing lifecycle methods", async () => {
    const list = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "pairing.list", params: { channel: "telegram" } },
    });
    const listBody = list.json();
    expect(list.statusCode).toBe(200);
    expect(listBody.ok).toBe(true);
    expect(listBody.result.pending.length).toBeGreaterThan(0);

    const approve = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "pairing.approve", params: { requestId: "req-1" } },
    });
    const approveBody = approve.json();
    expect(approve.statusCode).toBe(200);
    expect(approveBody.ok).toBe(true);
    expect(approveBody.result.ok).toBe(true);

    const reject = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "pairing.reject", params: { requestId: "req-1" } },
    });
    const rejectBody = reject.json();
    expect(reject.statusCode).toBe(200);
    expect(rejectBody.ok).toBe(true);
    expect(rejectBody.result.ok).toBe(true);

    const revoke = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "pairing.revoke", params: { channel: "telegram", userId: "u-2" } },
    });
    const revokeBody = revoke.json();
    expect(revoke.statusCode).toBe(200);
    expect(revokeBody.ok).toBe(true);
    expect(revokeBody.result.ok).toBe(true);
  });

  it("handles browser.request", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "browser.request", params: { action: "navigate", url: "https://example.com" } },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.message).toBe("navigated:https://example.com");
  });

  it("handles exec.approval.request (non-blocking)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: {
        method: "exec.approval.request",
        params: { id: "approval-42", command: "rm -rf /tmp/x", await: false },
      },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.id).toBe("approval-42");
    expect(body.result.pending).toBe(true);
  });

  it("handles exec.approval.resolve", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: {
        method: "exec.approval.resolve",
        params: { id: "approval-42", decision: "allow-once" },
      },
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
  });

  it("handles node pairing lifecycle and listing", async () => {
    const requested = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: {
        method: "node.pair.request",
        params: {
          nodeId: "device-1",
          connector: { type: "local", displayName: "Node Local" },
        },
      },
    });
    const requestedBody = requested.json();
    expect(requestedBody.ok).toBe(true);
    expect(requestedBody.result.request.nodeId).toBe("device-1");

    const requestId = requestedBody.result.request.requestId;
    const approved = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: {
        method: "node.pair.approve",
        params: { requestId },
      },
    });
    const approvedBody = approved.json();
    expect(approvedBody.ok).toBe(true);
    expect(approvedBody.result.node.nodeId).toBe("device-1");

    const list = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: { method: "node.list", params: {} },
    });
    const listBody = list.json();
    expect(listBody.ok).toBe(true);
    expect(listBody.result.nodes.length).toBeGreaterThan(0);
  });

  it("handles node.describe and node.invoke", async () => {
    const connectedNodeId = connectorRegistry.listConnected()[0]?.nodeId;
    expect(connectedNodeId).toBeTruthy();

    const describe = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: {
        method: "node.describe",
        params: { nodeId: connectedNodeId },
      },
    });
    const describeBody = describe.json();
    expect(describeBody.ok).toBe(true);
    expect(describeBody.result.nodeId).toBe(connectedNodeId);

    const invoke = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: {
        method: "node.invoke",
        params: { nodeId: connectedNodeId, command: "system.info" },
      },
    });
    const invokeBody = invoke.json();
    expect(invokeBody.ok).toBe(true);
    expect(invokeBody.result.ok).toBe(true);
  });

  it("handles node.pair.verify and device.token.rotate", async () => {
    const verify = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: {
        method: "node.pair.verify",
        params: { nodeId: "device-1", token: "token-abc" },
      },
    });
    const verifyBody = verify.json();
    expect(verifyBody.ok).toBe(true);
    expect(verifyBody.result.ok).toBe(true);

    const rotate = await app.inject({
      method: "POST",
      url: "/gateway",
      payload: {
        method: "device.token.rotate",
        params: { nodeId: "device-1" },
      },
    });
    const rotateBody = rotate.json();
    expect(rotateBody.ok).toBe(true);
    expect(rotateBody.result.nodeId).toBe("device-1");
    expect(rotateBody.result.token).toBe("token-rotated");
  });
});
