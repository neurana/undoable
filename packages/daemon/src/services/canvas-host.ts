import type { Socket } from "node:net";
import type { Duplex } from "node:stream";
import chokidar from "chokidar";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import {
  CANVAS_DEFAULT_URL,
  CANVAS_HOST_PATH,
  CANVAS_ROOT_URL,
  CANVAS_STARTER_PATH,
  CANVAS_WS_PATH,
} from "./canvas-constants.js";

export {
  CANVAS_DEFAULT_URL,
  CANVAS_HOST_PATH,
  CANVAS_ROOT_URL,
  CANVAS_STARTER_PATH,
  CANVAS_WS_PATH,
};

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
<title>Undoable Live Canvas</title>
<style>
  :root {
    --bg: #f5faf7;
    --surface: #ffffff;
    --surface-soft: #f0f7f3;
    --line: #d8e6de;
    --line-strong: #c1d6ca;
    --text: #17241f;
    --muted: #4e6258;
    --accent: #24543f;
    --accent-soft: #d9eee3;
  }
  html, body {
    margin: 0;
    min-height: 100%;
    font-family: "Space Grotesk", "Avenir Next", "Segoe UI", sans-serif;
    color: var(--text);
    background:
      radial-gradient(circle at 8% -12%, rgba(164, 221, 191, 0.5), transparent 36%),
      radial-gradient(circle at 88% 100%, rgba(198, 224, 212, 0.6), transparent 42%),
      var(--bg);
  }
  .wrap {
    min-height: 100vh;
    box-sizing: border-box;
    padding: 28px;
    display: grid;
    gap: 18px;
    grid-template-rows: auto auto 1fr;
  }
  .hero {
    border: 1px solid var(--line);
    background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(242,249,245,0.94));
    border-radius: 18px;
    padding: 18px;
    box-shadow: 0 14px 32px rgba(21, 42, 32, 0.08);
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border-radius: 999px;
    border: 1px solid var(--line-strong);
    background: var(--surface-soft);
    color: var(--accent);
    font-size: 11px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    padding: 4px 10px;
    font-weight: 600;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 4px rgba(36, 84, 63, 0.12);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.25); opacity: 0.6; }
  }
  h1 {
    margin: 12px 0 8px;
    font-size: clamp(27px, 4.1vw, 44px);
    line-height: 1.04;
    letter-spacing: -0.025em;
  }
  .lead {
    margin: 0;
    color: var(--muted);
    font-size: 15px;
    line-height: 1.5;
    max-width: 900px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .card {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
    padding: 14px;
    box-shadow: 0 8px 18px rgba(21, 42, 32, 0.05);
  }
  .card h2 {
    margin: 0 0 8px;
    font-size: 15px;
    letter-spacing: -0.01em;
  }
  .card p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
  }
  .commands {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: #0f1a16;
    color: #daf0e5;
    padding: 14px;
    overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.55;
    box-shadow: inset 0 0 0 1px rgba(143, 199, 173, 0.12);
  }
  .commands .comment {
    color: #9cc3b0;
  }
  .foot {
    margin-top: 10px;
    color: var(--muted);
    font-size: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .pill {
    border: 1px solid var(--line-strong);
    background: var(--surface-soft);
    border-radius: 999px;
    padding: 4px 9px;
  }
  @media (max-width: 980px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
<div class="wrap">
  <section class="hero">
    <span class="eyebrow"><span class="dot"></span>Undoable Canvas Host</span>
    <h1>Live Canvas Workspace</h1>
    <p class="lead">Agent-driven visual surface for previews, dashboards, and A2UI output. This page is the starter template generated in <code>~/.undoable/canvas/index.html</code>.</p>
    <div class="foot">
      <span class="pill">Purpose: visual output</span>
      <span class="pill">Mode: web + A2UI</span>
      <span class="pill">Reload: live</span>
    </div>
  </section>

  <section class="grid">
    <article class="card">
      <h2>Present</h2>
      <p>Call <code>canvas.present</code> to open this workspace panel and keep generated UI traceable.</p>
    </article>
    <article class="card">
      <h2>Navigate</h2>
      <p>Call <code>canvas.navigate</code> to render any URL in the workspace for guided browsing and demos.</p>
    </article>
    <article class="card">
      <h2>A2UI</h2>
      <p>Call <code>canvas.a2ui_push</code> to stream JSONL frames. Use <code>canvas.a2ui_reset</code> to clear.</p>
    </article>
  </section>

  <pre class="commands"><span class="comment"># Quick start commands</span>
canvas action="present"
canvas action="navigate" url="https://example.com"
canvas action="snapshot"
canvas action="status"

<span class="comment"># A2UI flow</span>
canvas action="a2ui_push" jsonl="{\\"kind\\":\\"card\\",\\"title\\":\\"Revenue\\",\\"value\\":\\"$124k\\"}"
canvas action="a2ui_reset"</pre>
  <div class="foot">
    <span>Create/edit this file to customize the default workspace.</span>
    <span>Live reload is active while this daemon runs.</span>
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
    return rootReal;
  }

  // Safe migration: only replace if the file still matches the legacy placeholder.
  try {
    const existing = await fs.readFile(indexPath, "utf8");
    const looksLegacy = existing.includes("Undoable Canvas Host")
      && existing.includes("Create <code>index.html</code> inside your canvas directory to render a custom canvas surface.");
    if (looksLegacy) {
      await fs.writeFile(indexPath, defaultIndexHtml(), "utf8");
    }
  } catch {
    // best effort only
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

      if (urlPath === "/__starter" || urlPath === "/__starter/") {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        const html = defaultIndexHtml();
        res.end(liveReload ? injectLiveReload(html) : html);
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
