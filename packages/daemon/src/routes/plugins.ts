import type { FastifyInstance } from "fastify";
import type { PluginRegistry } from "../plugins/registry.js";
import type { PluginContext } from "../plugins/types.js";

export function pluginRoutes(app: FastifyInstance, registry: PluginRegistry, ctx: PluginContext) {
  app.get("/plugins", async () => {
    return { plugins: registry.list() };
  });

  app.post<{ Params: { name: string } }>("/plugins/:name/enable", async (req, reply) => {
    const { name } = req.params;
    const plugin = registry.get(name);
    if (!plugin) return reply.code(404).send({ error: `Plugin not found: ${name}` });
    try {
      await registry.activate(name, ctx);
      return { ok: true, plugin: { ...plugin.manifest, active: true } };
    } catch (err) {
      return reply.code(500).send({ error: `Failed to activate plugin: ${err}` });
    }
  });

  app.post<{ Params: { name: string } }>("/plugins/:name/disable", async (req, reply) => {
    const { name } = req.params;
    const plugin = registry.get(name);
    if (!plugin) return reply.code(404).send({ error: `Plugin not found: ${name}` });
    try {
      await registry.deactivate(name);
      return { ok: true, plugin: { ...plugin.manifest, active: false } };
    } catch (err) {
      return reply.code(500).send({ error: `Failed to deactivate plugin: ${err}` });
    }
  });
}
