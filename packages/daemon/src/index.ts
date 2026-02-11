import process from "node:process";
import { createServer } from "./server/server.js";

const DEFAULT_PORT = 7433;

async function main() {
  const port = Number(process.env.NRN_PORT) || DEFAULT_PORT;
  const server = await createServer({ port });
  await server.start();
}

main().catch((err) => {
  console.error("[nrn-agentd] Fatal:", err);
  process.exit(1);
});
