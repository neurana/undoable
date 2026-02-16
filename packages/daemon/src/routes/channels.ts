import type { FastifyInstance } from "fastify";
import type { ChannelManager } from "../channels/index.js";
import type { ChannelId } from "../channels/types.js";

export function channelRoutes(app: FastifyInstance, manager: ChannelManager) {
  app.get("/channels", async () => {
    return manager.listAll();
  });

  app.get<{ Params: { id: string } }>("/channels/:id", async (req, reply) => {
    const result = manager.getStatus(req.params.id as ChannelId);
    if (!result) return reply.code(404).send({ error: "Channel not found" });
    return result;
  });

  app.put<{ Params: { id: string }; Body: { enabled?: boolean; token?: string; extra?: Record<string, unknown> } }>(
    "/channels/:id",
    async (req) => {
      const channelId = req.params.id as ChannelId;
      return manager.updateConfig(channelId, req.body);
    },
  );

  app.post<{ Params: { id: string } }>("/channels/:id/start", async (req, reply) => {
    try {
      await manager.startChannel(req.params.id as ChannelId);
      return { started: true };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>("/channels/:id/stop", async (req, reply) => {
    try {
      await manager.stopChannel(req.params.id as ChannelId);
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
