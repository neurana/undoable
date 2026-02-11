import Fastify from "fastify";
import { healthRoutes } from "../routes/health.js";

export type ServerOptions = {
  port: number;
  host?: string;
};

export async function createServer(opts: ServerOptions) {
  const app = Fastify({ logger: true });

  await app.register(healthRoutes);

  return {
    start: async () => {
      const host = opts.host ?? "127.0.0.1";
      await app.listen({ port: opts.port, host });
    },
    stop: async () => {
      await app.close();
    },
    app,
  };
}
