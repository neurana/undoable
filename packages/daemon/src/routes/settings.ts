import type { FastifyInstance } from "fastify";
import type {
  DaemonOperationMode,
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

  app.get("/control/operation", async () => {
    return daemonSettingsService.getOperationalState();
  });

  app.patch<{ Body: { mode?: DaemonOperationMode; reason?: string } }>(
    "/control/operation",
    async (req, reply) => {
      const mode = req.body?.mode;
      if (!mode) {
        return reply.code(400).send({
          error: "mode is required (normal, drain, or paused)",
        });
      }
      try {
        return await daemonSettingsService.setOperationalState(
          mode,
          req.body?.reason,
        );
      } catch (err) {
        return reply.code(400).send({
          error:
            err instanceof Error
              ? err.message
              : "Invalid operation control payload",
        });
      }
    },
  );
}
