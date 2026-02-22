import type { FastifyInstance } from "fastify";
import type { ChannelManager } from "../channels/index.js";
import type { ChannelConfig, ChannelId } from "../channels/types.js";
import { buildChannelStatusSnapshot } from "../channels/status-snapshot.js";

const CHANNEL_IDS = new Set<ChannelId>(["telegram", "discord", "slack", "whatsapp"]);
const SENSITIVE_CHANNEL_EXTRA_KEY_PATTERN = /(token|secret|password|key)/i;

function parseChannelId(raw: string): ChannelId | null {
  const value = raw.trim().toLowerCase();
  return CHANNEL_IDS.has(value as ChannelId) ? (value as ChannelId) : null;
}

function sanitizeChannelExtra(extra: ChannelConfig["extra"]): Record<string, unknown> | undefined {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return undefined;
  const safe = Object.fromEntries(
    Object.entries(extra).filter(([key]) => !SENSITIVE_CHANNEL_EXTRA_KEY_PATTERN.test(key)),
  );
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function toPublicChannelConfig(config: ChannelConfig) {
  const rawExtra = config.extra && typeof config.extra === "object" && !Array.isArray(config.extra)
    ? config.extra as Record<string, unknown>
    : undefined;
  const appToken = rawExtra?.appToken;
  return {
    channelId: config.channelId,
    enabled: config.enabled,
    extra: sanitizeChannelExtra(config.extra),
    allowDMs: config.allowDMs,
    allowGroups: config.allowGroups,
    userAllowlist: config.userAllowlist,
    userBlocklist: config.userBlocklist,
    rateLimit: config.rateLimit,
    maxMediaBytes: config.maxMediaBytes,
    hasToken: Boolean(config.token && config.token.trim().length > 0),
    hasAppToken: typeof appToken === "string" && appToken.trim().length > 0,
  };
}

export function channelRoutes(app: FastifyInstance, manager: ChannelManager) {
  app.get("/channels", async () => {
    return manager.listAll().map((row) => ({
      config: toPublicChannelConfig(row.config),
      status: row.status,
      snapshot: buildChannelStatusSnapshot(row.config, row.status),
    }));
  });

  app.get<{ Params: { id: string } }>("/channels/:id", async (req, reply) => {
    const channelId = parseChannelId(req.params.id);
    if (!channelId) return reply.code(404).send({ error: "Channel not found" });
    const result = manager.getStatus(channelId);
    if (!result) return reply.code(404).send({ error: "Channel not found" });
    return {
      config: toPublicChannelConfig(result.config),
      status: result.status,
      snapshot: buildChannelStatusSnapshot(result.config, result.status),
    };
  });

  app.put<{
    Params: { id: string };
    Body: {
      enabled?: boolean;
      token?: string | null;
      extra?: Record<string, unknown> | null;
      allowDMs?: boolean;
      allowGroups?: boolean;
      userAllowlist?: string[];
      userBlocklist?: string[];
      rateLimit?: number;
      maxMediaBytes?: number;
    };
  }>(
    "/channels/:id",
    async (req, reply) => {
      const channelId = parseChannelId(req.params.id);
      if (!channelId) return reply.code(404).send({ error: "Channel not found" });

      const hasTokenKey = Object.prototype.hasOwnProperty.call(req.body, "token");
      const hasExtraKey = Object.prototype.hasOwnProperty.call(req.body, "extra");

      const patch: Partial<ChannelConfig> = {};
      if (typeof req.body.enabled === "boolean") patch.enabled = req.body.enabled;
      if (typeof req.body.allowDMs === "boolean") patch.allowDMs = req.body.allowDMs;
      if (typeof req.body.allowGroups === "boolean") patch.allowGroups = req.body.allowGroups;
      if (Array.isArray(req.body.userAllowlist)) patch.userAllowlist = req.body.userAllowlist;
      if (Array.isArray(req.body.userBlocklist)) patch.userBlocklist = req.body.userBlocklist;
      if (typeof req.body.rateLimit === "number") patch.rateLimit = req.body.rateLimit;
      if (typeof req.body.maxMediaBytes === "number") patch.maxMediaBytes = req.body.maxMediaBytes;

      if (hasTokenKey) {
        if (req.body.token === null) {
          patch.token = undefined;
        } else if (typeof req.body.token === "string") {
          patch.token = req.body.token;
        }
      }

      if (hasExtraKey) {
        if (req.body.extra === null) {
          patch.extra = {};
        } else if (req.body.extra && typeof req.body.extra === "object" && !Array.isArray(req.body.extra)) {
          const existing = manager.getStatus(channelId)?.config.extra;
          const existingObject = existing && typeof existing === "object" && !Array.isArray(existing)
            ? existing
            : {};
          patch.extra = {
            ...existingObject,
            ...req.body.extra,
          };
        }
      }

      const updated = await manager.updateConfig(channelId, patch);
      return toPublicChannelConfig(updated);
    },
  );

  app.post<{ Params: { id: string } }>("/channels/:id/start", async (req, reply) => {
    const channelId = parseChannelId(req.params.id);
    if (!channelId) return reply.code(404).send({ error: "Channel not found" });
    try {
      await manager.startChannel(channelId);
      return { started: true };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>("/channels/:id/stop", async (req, reply) => {
    const channelId = parseChannelId(req.params.id);
    if (!channelId) return reply.code(404).send({ error: "Channel not found" });
    try {
      await manager.stopChannel(channelId);
      return { stopped: true };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get("/channels/whatsapp/qr", async (_req, reply) => {
    const result = manager.getStatus("whatsapp");
    if (!result) return reply.code(404).send({ error: "WhatsApp channel not found" });
    if (!result.status.qrDataUrl) return reply.code(404).send({ error: "No QR code available" });
    return { qrDataUrl: result.status.qrDataUrl };
  });
}
