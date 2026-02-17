import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";


const MEDIA_DIR = path.join(os.homedir(), ".undoable", "media");
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

export type StoredMedia = {
  id: string;
  filePath: string;
  originalName?: string;
  contentType: string;
  size: number;
  createdAt: number;
};

export type ImageInfo = {
  width: number;
  height: number;
  format: string;
  channels: number;
  size: number;
};

export type MediaFetchResult = {
  buffer: Buffer;
  contentType: string;
  size: number;
};

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
};

function guessMime(urlOrName: string, headerType?: string): string {
  if (headerType && headerType !== "application/octet-stream") return headerType;
  const ext = path.extname(new URL(urlOrName, "http://localhost").pathname).toLowerCase();
  return MIME_MAP[ext] ?? headerType ?? "application/octet-stream";
}

export class MediaService {
  private ensured = false;

  private async ensureDir() {
    if (this.ensured) return;
    await fsp.mkdir(MEDIA_DIR, { recursive: true });
    this.ensured = true;
  }

  async fetch(url: string, opts?: { maxBytes?: number }): Promise<MediaFetchResult> {
    const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
    const res = await globalThis.fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > maxBytes) {
      throw new Error(`File too large: ${contentLength} bytes (max ${maxBytes})`);
    }

    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    if (buffer.length > maxBytes) {
      throw new Error(`File too large: ${buffer.length} bytes (max ${maxBytes})`);
    }

    const contentType = guessMime(url, res.headers.get("content-type") ?? undefined);
    return { buffer, contentType, size: buffer.length };
  }

  async store(buffer: Buffer, opts?: { contentType?: string; originalName?: string }): Promise<StoredMedia> {
    await this.ensureDir();
    const id = crypto.randomUUID();
    const ct = opts?.contentType ?? "application/octet-stream";
    const ext = Object.entries(MIME_MAP).find(([, v]) => v === ct)?.[0] ?? "";
    const filePath = path.join(MEDIA_DIR, `${id}${ext}`);
    await fsp.writeFile(filePath, buffer);

    return {
      id,
      filePath,
      originalName: opts?.originalName,
      contentType: ct,
      size: buffer.length,
      createdAt: Date.now(),
    };
  }

  async download(url: string, opts?: { maxBytes?: number }): Promise<StoredMedia> {
    const result = await this.fetch(url, opts);
    const urlPath = new URL(url, "http://localhost").pathname;
    const originalName = path.basename(urlPath) || undefined;
    return this.store(result.buffer, { contentType: result.contentType, originalName });
  }

  async imageInfo(filePath: string): Promise<ImageInfo> {
    const sharp = await this.loadSharp();
    const metadata = await sharp(filePath).metadata();
    const stat = await fsp.stat(filePath);
    return {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      format: metadata.format ?? "unknown",
      channels: metadata.channels ?? 0,
      size: stat.size,
    };
  }

  async resize(filePath: string, opts: { maxSide: number; format?: "jpeg" | "png"; quality?: number }): Promise<StoredMedia> {
    await this.ensureDir();
    const sharp = await this.loadSharp();
    const img = sharp(filePath);
    const metadata = await img.metadata();
    const w = metadata.width ?? 0;
    const h = metadata.height ?? 0;

    let resized = img;
    if (w > opts.maxSide || h > opts.maxSide) {
      resized = img.resize({ width: opts.maxSide, height: opts.maxSide, fit: "inside" });
    }

    const format = opts.format ?? "jpeg";
    const quality = opts.quality ?? 85;
    const buffer = await resized[format]({ quality }).toBuffer();

    const id = crypto.randomUUID();
    const ext = format === "jpeg" ? ".jpg" : ".png";
    const outPath = path.join(MEDIA_DIR, `${id}${ext}`);
    await fsp.writeFile(outPath, buffer);

    return {
      id,
      filePath: outPath,
      contentType: `image/${format}`,
      size: buffer.length,
      createdAt: Date.now(),
    };
  }

  async cleanup(ttlMs?: number): Promise<{ removed: number }> {
    const ttl = ttlMs ?? DEFAULT_TTL_MS;
    const cutoff = Date.now() - ttl;
    let removed = 0;

    try {
      const files = await fsp.readdir(MEDIA_DIR);
      for (const file of files) {
        const fp = path.join(MEDIA_DIR, file);
        const stat = await fsp.stat(fp);
        if (stat.mtimeMs < cutoff) {
          await fsp.unlink(fp);
          removed++;
        }
      }
    } catch {
      // Directory may not exist
    }

    return { removed };
  }

  async list(): Promise<StoredMedia[]> {
    try {
      const files = await fsp.readdir(MEDIA_DIR);
      const result: StoredMedia[] = [];
      for (const file of files) {
        const fp = path.join(MEDIA_DIR, file);
        const stat = await fsp.stat(fp);
        const ext = path.extname(file).toLowerCase();
        const ct = MIME_MAP[ext] ?? "application/octet-stream";
        result.push({
          id: path.basename(file, ext),
          filePath: fp,
          contentType: ct,
          size: stat.size,
          createdAt: stat.birthtimeMs,
        });
      }
      return result.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadSharp(): Promise<any> {
    try {
      const mod = "sharp";
      return (await import(/* webpackIgnore: true */ mod)).default;
    } catch {
      throw new Error("sharp is not installed. Run: pnpm add sharp");
    }
  }
}
