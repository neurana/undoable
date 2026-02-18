import type { FastifyInstance } from "fastify";
import type {
  DaemonSettingsPatch,
  DaemonSettingsService,
} from "../services/daemon-settings-service.js";

export function settingsRoutes(
  app: FastifyInstance,
  daemonSettingsService: DaemonSettingsService,
) {
  app.get("/settings/daemon", async () => {
    return daemonSettingsService.getSnapshot();
  });

  app.patch<{ Body: DaemonSettingsPatch }>("/settings/daemon", async (req, reply) => {
    try {
      return await daemonSettingsService.update(req.body ?? {});
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "Invalid daemon settings patch",
      });
    }
  });
}
