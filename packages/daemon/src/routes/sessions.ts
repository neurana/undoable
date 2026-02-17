import type { FastifyInstance } from "fastify";
import type { ChatService } from "../services/chat-service.js";

const INTERNAL_PREFIXES = ["run-", "cron-", "channel-", "send-", "agent-", "test-"];

export function sessionRoutes(app: FastifyInstance, chatService: ChatService) {
  app.get("/sessions", async (req) => {
    const query = req.query as { limit?: string; active_minutes?: string; include_internal?: string };
    const limit = query.limit ? Math.min(200, Math.max(1, Number(query.limit))) : 50;
    const activeMinutes = query.active_minutes ? Number(query.active_minutes) : undefined;
    const includeInternal = query.include_internal === "true";

    let sessions = await chatService.listSessions();

    if (!includeInternal) {
      sessions = sessions.filter((s) => !INTERNAL_PREFIXES.some((p) => s.id.startsWith(p)));
    }

    if (activeMinutes && activeMinutes > 0) {
      const cutoff = Date.now() - activeMinutes * 60 * 1000;
      sessions = sessions.filter((s) => s.updatedAt >= cutoff);
    }

    return sessions.slice(0, limit);
  });

  app.get<{ Params: { id: string } }>("/sessions/:id", async (req, reply) => {
    const session = await chatService.loadSession(req.params.id);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    return {
      id: session.id,
      title: session.title,
      agentId: session.agentId,
      messageCount: session.messages.filter((m) => m.role !== "system").length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  });

  app.get<{ Params: { id: string } }>("/sessions/:id/history", async (req, reply) => {
    const query = req.query as { limit?: string; include_tools?: string };
    const limit = query.limit ? Math.min(100, Math.max(1, Number(query.limit))) : 50;
    const includeTools = query.include_tools === "true";

    const session = await chatService.loadSession(req.params.id);
    if (!session) return reply.code(404).send({ error: "Session not found" });

    let messages = await chatService.getHistory(req.params.id);
    if (!includeTools) {
      messages = messages.filter((m) => m.role === "user" || m.role === "assistant");
    }

    return { messages: messages.slice(-limit), count: messages.length };
  });

  app.post<{ Params: { id: string }; Body: { message: string } }>("/sessions/:id/send", async (req, reply) => {
    const message = req.body?.message;
    if (!message?.trim()) return reply.code(400).send({ error: "Message is required" });

    await chatService.addUserMessage(req.params.id, message);
    return { sent: true, session_id: req.params.id };
  });

  app.post("/sessions/cleanup", async () => {
    const removed = await chatService.cleanupEmptySessions();
    return { removed };
  });
}
