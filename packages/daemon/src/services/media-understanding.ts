import fsp from "node:fs/promises";
import path from "node:path";
import type { SttService } from "./stt-service.js";
import type { CallLLMFn } from "./run-executor.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".ogg", ".wav", ".webm", ".m4a", ".mp4"]);

const AUDIO_MIME_MAP: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
};

export type MediaUnderstandingDeps = {
  callLLM: CallLLMFn;
  sttService: SttService;
};

export class MediaUnderstandingService {
  constructor(private deps: MediaUnderstandingDeps) {}

  async describeImage(filePath: string, prompt?: string): Promise<{ description: string }> {
    const ext = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported image format: ${ext}`);
    }

    const data = await fsp.readFile(filePath);
    const base64 = data.toString("base64");
    const mimeType = ext === ".png" ? "image/png"
      : ext === ".gif" ? "image/gif"
      : ext === ".webp" ? "image/webp"
      : "image/jpeg";

    const userPrompt = prompt ?? "Describe this image in detail. Include relevant text, objects, colors, and context.";

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      },
    ];

    const response = await this.deps.callLLM(messages, [], false);
    let description: string;
    if (response instanceof Response) {
      const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      description = json.choices?.[0]?.message?.content ?? "Could not describe image.";
    } else {
      description = response.content ?? "Could not describe image.";
    }

    return { description };
  }

  async transcribeAudio(filePath: string, opts?: { language?: string }): Promise<{ text: string }> {
    const ext = path.extname(filePath).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported audio format: ${ext}`);
    }

    const buffer = await fsp.readFile(filePath);
    const mime = AUDIO_MIME_MAP[ext] ?? "audio/webm";

    return this.deps.sttService.transcribe(buffer, { mime, language: opts?.language });
  }

  isImage(filePath: string): boolean {
    return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  isAudio(filePath: string): boolean {
    return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }
}
