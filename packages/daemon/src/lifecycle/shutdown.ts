import type { FastifyInstance } from "fastify";

export type ShutdownHandler = () => Promise<void> | void;

export class GracefulShutdown {
  private handlers: ShutdownHandler[] = [];
  private shuttingDown = false;

  register(handler: ShutdownHandler): void {
    this.handlers.push(handler);
  }

  attachSignals(server?: FastifyInstance): void {
    const shutdown = async (_signal: string) => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;

      if (server) {
        await server.close().catch(() => {});
      }

      for (const handler of this.handlers) {
        try {
          await handler();
        } catch {
          // best-effort cleanup
        }
      }

      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  async executeHandlers(): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler();
      } catch {
        // best-effort
      }
    }
  }
}
