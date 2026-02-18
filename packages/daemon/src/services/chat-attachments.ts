const DEFAULT_ATTACHMENT_MAX_MB = 10;
const DEFAULT_ATTACHMENT_MAX_BYTES = DEFAULT_ATTACHMENT_MAX_MB * 1024 * 1024;
const IMAGE_SIGNATURES: Array<{ prefix: number[]; mime: string }> = [
  { prefix: [0x89, 0x50, 0x4e, 0x47], mime: "image/png" },
  { prefix: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  { prefix: [0x47, 0x49, 0x46, 0x38], mime: "image/gif" },
];
const MAX_TEXT_ATTACHMENT_DECODE_BYTES = 512 * 1024;

function resolveAttachmentLimitBytes(): number {
  const bytesRaw = process.env.UNDOABLE_ATTACHMENT_MAX_BYTES?.trim();
  if (bytesRaw) {
    const bytes = Number(bytesRaw);
    if (Number.isFinite(bytes) && bytes > 0) return Math.floor(bytes);
  }

  const mbRaw = process.env.UNDOABLE_ATTACHMENT_MAX_MB?.trim();
  if (mbRaw) {
    const mb = Number(mbRaw);
    if (Number.isFinite(mb) && mb > 0) return Math.floor(mb * 1024 * 1024);
  }

  return DEFAULT_ATTACHMENT_MAX_BYTES;
}

const MAX_ATTACHMENT_BYTES = resolveAttachmentLimitBytes();

export type ChatAttachment = {
  mimeType?: string;
  fileName?: string;
  content: string;
};

export type ParsedImage = {
  data: string;
  mimeType: string;
  fileName?: string;
};

export type ParsedAttachments = {
  images: ParsedImage[];
  textBlocks: string[];
};

function stripDataUrl(content: string): string {
  const match = /^data:[^;]+;base64,(.*)$/.exec(content.trim());
  return match ? match[1]! : content.trim();
}

function isValidBase64(s: string): boolean {
  if (s.length === 0) return false;
  if (/[^A-Za-z0-9+/=\n\r]/.test(s)) return false;
  try {
    return Buffer.from(s, "base64").length > 0;
  } catch {
    return false;
  }
}

function estimateBase64Bytes(s: string): number {
  const normalized = s.replace(/\s+/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  const estimated = Math.floor((normalized.length * 3) / 4) - padding;
  return estimated > 0 ? estimated : 0;
}

function sniffMime(b64: string): string | undefined {
  const take = Math.min(32, b64.length);
  const sliceLen = take - (take % 4);
  if (sliceLen < 4) return undefined;
  try {
    const bytes = Buffer.from(b64.slice(0, sliceLen), "base64");
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
    for (const sig of IMAGE_SIGNATURES) {
      if (sig.prefix.every((b, i) => bytes[i] === b)) return sig.mime;
    }
  } catch { /* ignore */ }
  return undefined;
}

function isImageMime(mime?: string): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}

export function parseAttachments(
  attachments: ChatAttachment[],
  opts?: { maxBytes?: number },
): ParsedAttachments {
  const maxBytes = opts?.maxBytes ?? MAX_ATTACHMENT_BYTES;
  const images: ParsedImage[] = [];
  const textBlocks: string[] = [];

  for (const att of attachments) {
    if (!att?.content) continue;
    const label = att.fileName ?? "attachment";
    const b64 = stripDataUrl(att.content);

    const sizeBytes = estimateBase64Bytes(b64);
    if (sizeBytes > maxBytes) {
      throw new Error(`${label}: exceeds ${maxBytes} byte limit (${sizeBytes})`);
    }

    if (!isValidBase64(b64)) {
      throw new Error(`${label}: invalid base64 content`);
    }

    const sniffed = sniffMime(b64);
    const provided = att.mimeType?.split(";")[0]?.trim().toLowerCase();

    if (sniffed && isImageMime(sniffed)) {
      images.push({ data: b64, mimeType: sniffed, fileName: att.fileName });
    } else if (!sniffed && isImageMime(provided)) {
      images.push({ data: b64, mimeType: provided!, fileName: att.fileName });
    } else if (provided?.startsWith("text/") || !sniffed) {
      try {
        if (sizeBytes > MAX_TEXT_ATTACHMENT_DECODE_BYTES) {
          textBlocks.push(`[File: ${label}] (text omitted, ${sizeBytes} bytes)`);
          continue;
        }
        const text = Buffer.from(b64, "base64").toString("utf-8");
        textBlocks.push(`[File: ${label}]\n${text}`);
      } catch {
        textBlocks.push(`[File: ${label}] (binary, ${sizeBytes} bytes)`);
      }
    } else {
      textBlocks.push(`[File: ${label}] (${sniffed ?? provided ?? "unknown"}, ${sizeBytes} bytes)`);
    }
  }

  return { images, textBlocks };
}
