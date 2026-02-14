import type { FastifyInstance } from "fastify";
import { exec } from "node:child_process";

function openCommand(): string {
  switch (process.platform) {
    case "darwin":
      return "open";
    case "win32":
      return "start";
    default:
      return "xdg-open";
  }
}

export function fileRoutes(app: FastifyInstance) {
  app.post<{ Body: { path: string } }>("/files/open", async (req, reply) => {
    const filePath = req.body?.path;
    if (!filePath || typeof filePath !== "string") {
      return reply.status(400).send({ error: "path is required" });
    }

    return new Promise((resolve) => {
      const cmd = `${openCommand()} ${JSON.stringify(filePath)}`;
      exec(cmd, { timeout: 5000 }, (err) => {
        if (err) {
          resolve(reply.status(500).send({ error: err.message, path: filePath }));
        } else {
          resolve(reply.send({ opened: true, path: filePath }));
        }
      });
    });
  });
}
