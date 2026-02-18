import type { FastifyInstance } from "fastify";
import type { ChannelManager } from "../channels/index.js";
import type { ChannelId } from "../channels/types.js";
import { buildChannelStatusSnapshot } from "../channels/status-snapshot.js";

const CHANNEL_IDS = new Set<ChannelId>(["telegram", "discord", "slack", "whatsapp"]);

function parseChannelId(raw: string): ChannelId | null {
  const value = raw.trim().toLowerCase();
  return CHANNEL_IDS.has(value as ChannelId) ? (value as ChannelId) : null;
}

export function channelRoutes(app: FastifyInstance, manager: ChannelManager) {
  app.get("/channels", async () => {
    return manager.listAll().map((row) => ({
      ...row,
      snapshot: buildChannelStatusSnapshot(row.config, row.status),
    }));
  });

  app.get<{ Params: { id: string } }>("/channels/:id", async (req, reply) => {
    const channelId = parseChannelId(req.params.id);
    if (!channelId) return reply.code(404).send({ error: "Channel not found" });
    const result = manager.getStatus(channelId);
    if (!result) return reply.code(404).send({ error: "Channel not found" });
    return {
      ...result,
      snapshot: buildChannelStatusSnapshot(result.config, result.status),
    };
  });

  app.put<{
    Params: { id: string };
    Body: {
      enabled?: boolean;
      token?: string;
      extra?: Record<string, unknown>;
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
      return manager.updateConfig(channelId, req.body);
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
