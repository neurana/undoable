import type { Socket } from "node:net";
import type { Duplex } from "node:stream";
import chokidar from "chokidar";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";

export const CANVAS_HOST_PATH = "/__undoable__/canvas";
export const CANVAS_WS_PATH = "/__undoable__/ws";

export type CanvasHostHandler = {
  rootDir: string;
  basePath: string;
  handleHttpRequest: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => boolean;
  close: () => Promise<void>;
};

export type CanvasHostOptions = {
  rootDir?: string;
  basePath?: string;
  liveReload?: boolean;
  allowInTests?: boolean;
  logError?: (message: string) => void;
};

function defaultIndexHtml() {
  return `<!doctype html>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Undoable Canvas Host</title>
<style>
  html, body { margin: 0; height: 100%; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; background: #0f1115; color: #e8eaed; }
  .wrap { min-height: 100%; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
  .card { width: min(720px, 100%); background: #171a20; border: 1px solid #2c313c; border-radius: 14px; padding: 18px; }
  h1 { margin: 0 0 8px; font-size: 22px; font-weight: 600; }
  p { margin: 0; color: #aeb5c1; line-height: 1.5; }
  code { background: #11141a; border: 1px solid #2a2f39; border-radius: 6px; padding: 2px 6px; color: #d5dae3; }
</style>
<div class="wrap">
  <div class="card">
    <h1>Undoable Canvas Host</h1>
    <p>Create <code>index.html</code> inside your canvas directory to render a custom canvas surface.</p>
  </div>
</div>
`;
}

function injectLiveReload(html: string): string {
  const script = `<script>(() => {
  try {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(proto + "://" + window.location.host + "${CANVAS_WS_PATH}");
    ws.onmessage = (event) => {
      if (event.data === "reload") {
        window.location.reload();
      }
    };
  } catch {
    // ignore live reload failures
  }
})();</script>`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${script}</body>`);
  }
  return `${html}\n${script}`;
}

function normalizeUrlPath(rawPath: string): string {
  const decoded = decodeURIComponent(rawPath || "/");
  const normalized = path.posix.normalize(decoded);
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeBasePath(rawPath: string | undefined): string {
  const trimmed = (rawPath ?? CANVAS_HOST_PATH).trim();
  const normalized = normalizeUrlPath(trimmed || CANVAS_HOST_PATH);
  if (normalized === "/") return "/";
  return normalized.replace(/\/+$/, "");
}

function isWithinRoot(rootDir: string, filePath: string): boolean {
  if (filePath === rootDir) return true;
  const prefix = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
  return filePath.startsWith(prefix);
}

async function resolveFilePath(rootReal: string, urlPath: string): Promise<string | null> {
  const normalized = normalizeUrlPath(urlPath);
  const rel = normalized.replace(/^\/+/, "");
  if (rel.split("/").some((segment) => segment === "..")) {
    return null;
  }

  const candidate = path.resolve(rootReal, rel || ".");
  if (!isWithinRoot(rootReal, candidate)) {
    return null;
  }

  let filePath = candidate;
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  } catch {
    if (normalized.endsWith("/")) {
      filePath = path.join(filePath, "index.html");
    }
  }

  try {
    const realPath = await fs.realpath(filePath);
    if (!isWithinRoot(rootReal, realPath)) {
      return null;
    }
    const stat = await fs.stat(realPath);
    if (!stat.isFile()) {
      return null;
    }
    return realPath;
  } catch {
    return null;
  }
}

function detectMime(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".css")) return "text/css";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  return "application/octet-stream";
}

function isDisabledByEnv() {
  if (process.env.UNDOABLE_SKIP_CANVAS_HOST === "1") return true;
  if (process.env.NODE_ENV === "test") return true;
  if (process.env.VITEST) return true;
  return false;
}

async function prepareCanvasRoot(rootDir: string) {
  await fs.mkdir(rootDir, { recursive: true });
  const rootReal = await fs.realpath(rootDir);
  const indexPath = path.join(rootReal, "index.html");
  if (!fsSync.existsSync(indexPath)) {
    await fs.writeFile(indexPath, defaultIndexHtml(), "utf8").catch(() => { });
  }
  return rootReal;
}

function resolveDefaultCanvasRoot(): string {
  return path.join(os.homedir(), ".undoable", "canvas");
}

export async function createCanvasHostHandler(opts: CanvasHostOptions = {}): Promise<CanvasHostHandler> {
  const basePath = normalizeBasePath(opts.basePath);
  if (isDisabledByEnv() && opts.allowInTests !== true) {
    return {
      rootDir: "",
      basePath,
      handleHttpRequest: async () => false,
      handleUpgrade: () => false,
      close: async () => { },
    };
  }

  const rootDir = path.resolve(opts.rootDir ?? resolveDefaultCanvasRoot());
  const rootReal = await prepareCanvasRoot(rootDir);

  const liveReload = opts.liveReload !== false;
  const wss = liveReload ? new WebSocketServer({ noServer: true }) : null;
  const sockets = new Set<WebSocket>();
  if (wss) {
    wss.on("connection", (ws: WebSocket) => {
      sockets.add(ws);
      ws.on("close", () => sockets.delete(ws));
    });
  }

  let debounce: NodeJS.Timeout | null = null;
  const broadcastReload = () => {
    for (const ws of sockets) {
      try {
        ws.send("reload");
      } catch {
        // ignore closed sockets
      }
    }
  };

  const scheduleReload = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      broadcastReload();
    }, 80);
    debounce.unref?.();
  };

  let watcherClosed = false;
  const watcher = liveReload
    ? chokidar.watch(rootReal, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 10 },
      usePolling: opts.allowInTests === true,
      ignored: [/(^|[\\/])\../, /(^|[\\/])node_modules([\\/]|$)/],
    })
    : null;

  watcher?.on("all", () => scheduleReload());
  watcher?.on("error", (err: unknown) => {
    if (watcherClosed) return;
    watcherClosed = true;
    opts.logError?.(`canvas host watcher error: ${String(err)}`);
    void watcher.close().catch(() => { });
  });

  const handleUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!wss) return false;
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== CANVAS_WS_PATH) return false;
    wss.handleUpgrade(req, socket as Socket, head, (ws: WebSocket) => {
      wss.emit("connection", ws, req);
    });
    return true;
  };

  const handleHttpRequest = async (req: IncomingMessage, res: ServerResponse) => {
    const rawUrl = req.url;
    if (!rawUrl) return false;

    try {
      const url = new URL(rawUrl, "http://localhost");
      if (url.pathname === CANVAS_WS_PATH) {
        res.statusCode = liveReload ? 426 : 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(liveReload ? "upgrade required" : "not found");
        return true;
      }

      let urlPath = url.pathname;
      if (basePath !== "/") {
        if (urlPath !== basePath && !urlPath.startsWith(`${basePath}/`)) {
          return false;
        }
        urlPath = urlPath === basePath ? "/" : urlPath.slice(basePath.length) || "/";
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        res.statusCode = 405;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Method Not Allowed");
        return true;
      }

      const filePath = await resolveFilePath(rootReal, urlPath);
      if (!filePath) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("not found");
        return true;
      }

      const data = await fs.readFile(filePath);
      const mime = detectMime(filePath);
      res.setHeader("Cache-Control", "no-store");
      if (mime === "text/html") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        const html = data.toString("utf8");
        res.end(liveReload ? injectLiveReload(html) : html);
        return true;
      }

      res.setHeader("Content-Type", mime);
      res.end(data);
      return true;
    } catch (err) {
      opts.logError?.(`canvas host request failed: ${String(err)}`);
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("error");
      return true;
    }
  };

  return {
    rootDir,
    basePath,
    handleHttpRequest,
    handleUpgrade,
    close: async () => {
      if (debounce) clearTimeout(debounce);
      watcherClosed = true;
      await watcher?.close().catch(() => { });
      if (wss) {
        await new Promise<void>((resolve) => wss.close(() => resolve()));
      }
    },
  };
}
