import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import { exec } from "node:child_process";
import os from "node:os";
import path from "node:path";

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

function resolveRequestedPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return path.resolve(trimmed);
}

function attachmentFileName(filePath: string): string {
  const base = path.basename(filePath).replace(/["\r\n]/g, "_");
  return base || "download";
}

function normalizeRootPath(rootPath: string): string {
  const resolved = path.resolve(rootPath);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function resolveAllowedDownloadRoots(): string[] {
  const configured = process.env.UNDOABLE_DOWNLOAD_ALLOWED_ROOTS
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => normalizeRootPath(entry));

  if (configured && configured.length > 0) {
    return Array.from(new Set(configured));
  }

  return Array.from(
    new Set([
      path.resolve(process.cwd()),
      path.resolve(os.homedir()),
      path.resolve(os.tmpdir()),
    ].map((entry) => normalizeRootPath(entry))),
  );
}

function isPathWithinRoots(filePath: string, roots: string[]): boolean {
  return roots.some((root) => {
    const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    return filePath === root || filePath.startsWith(normalizedRoot);
  });
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

  app.get<{ Querystring: { path?: string } }>(
    "/files/download",
    async (req, reply) => {
      const filePath = resolveRequestedPath(req.query?.path);
      if (!filePath) {
        return reply.status(400).send({ error: "path is required" });
      }

      let stats: fs.Stats;
      try {
        stats = await fs.promises.stat(filePath);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          return reply.status(404).send({ error: "File not found", path: filePath });
        }
        req.log.error({ err, filePath }, "failed to stat file");
        return reply.status(500).send({ error: "Failed to access file" });
      }

      if (!stats.isFile()) {
        return reply
          .status(400)
          .send({ error: "path must reference a file", path: filePath });
      }

      const realPath = await fs.promises.realpath(filePath);
      const allowedRoots = resolveAllowedDownloadRoots();
      if (!isPathWithinRoots(realPath, allowedRoots)) {
        return reply.status(403).send({
          error: "path is outside allowed download roots",
          path: filePath,
        });
      }

      reply.header(
        "Content-Disposition",
        `attachment; filename="${attachmentFileName(filePath)}"`,
      );
      reply.header("Content-Length", String(stats.size));
      reply.type("application/octet-stream");
      return reply.send(fs.createReadStream(filePath));
    },
  );
}
