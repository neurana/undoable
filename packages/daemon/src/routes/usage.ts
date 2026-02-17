import type { FastifyInstance } from "fastify";
import type { UsageService } from "../services/usage-service.js";

export function usageRoutes(app: FastifyInstance, usageService: UsageService) {
  app.get<{ Querystring: { days?: string } }>("/usage", async (req) => {
    const days = req.query.days ? Number(req.query.days) : undefined;
    return usageService.getSummary(days);
  });

  app.get<{ Params: { id: string } }>("/usage/sessions/:id", async (req) => {
    const cost = usageService.getSessionCost(req.params.id);
    return { sessionId: req.params.id, costUsd: cost };
  });

  app.get<{ Querystring: { days?: string } }>("/usage/daily", async (req) => {
    const days = req.query.days ? Number(req.query.days) : 30;
    return { days, breakdown: usageService.getDailyBreakdown(days) };
  });
}
