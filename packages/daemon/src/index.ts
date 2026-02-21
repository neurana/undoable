import process from "node:process";
import { createServer } from "./server/server.js";
import { GracefulShutdown } from "./lifecycle/shutdown.js";
import { resolveDaemonLaunchConfig } from "./lifecycle/launch-config.js";

const gracefulShutdown = new GracefulShutdown();
let activeServer: Awaited<ReturnType<typeof createServer>> | null = null;

async function stopServer(): Promise<void> {
  if (!activeServer) return;
  const current = activeServer;
  activeServer = null;
  await current.stop();
}

let fatalInProgress = false;

async function handleFatal(source: string, err: unknown): Promise<void> {
  if (fatalInProgress) return;
  fatalInProgress = true;
  console.error(`[nrn-agentd] Fatal (${source}):`, err);
  await stopServer().catch(() => {});
  process.exit(1);
}

process.on("uncaughtException", (err) => {
  void handleFatal("uncaughtException", err);
});

process.on("unhandledRejection", (reason) => {
  void handleFatal("unhandledRejection", reason);
});

async function main() {
  const launchConfig = resolveDaemonLaunchConfig(process.env);
  const server = await createServer({
    port: launchConfig.port,
    host: launchConfig.host,
  });
  activeServer = server;
  gracefulShutdown.register(async () => {
    await stopServer().catch(() => {});
  });
  gracefulShutdown.attachSignals();
  await server.start();
}

main().catch((err) => {
  void handleFatal("startup", err);
});
