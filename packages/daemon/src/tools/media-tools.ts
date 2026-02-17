import type { AgentTool } from "./types.js";
import type { MediaService } from "../services/media-service.js";
import type { MediaUnderstandingService } from "../services/media-understanding.js";

export function createMediaTool(mediaService: MediaService, mediaUnderstanding?: MediaUnderstandingService): AgentTool {
  const hasUnderstanding = !!mediaUnderstanding;
  const actions = ["download", "info", "resize", "list", "cleanup"];
  if (hasUnderstanding) actions.push("describe", "transcribe");

  return {
    name: "media",
    definition: {
      type: "function",
      function: {
        name: "media",
        description: [
          "Download, inspect, resize, and manage media files.",
          hasUnderstanding
            ? "Actions: download, info, resize, describe, transcribe, list, cleanup."
            : "Actions: download, info, resize, list, cleanup.",
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: actions,
              description: "The action to perform",
            },
            url: { type: "string", description: "URL to download (for 'download')" },
            file_path: { type: "string", description: "Local file path (for 'info', 'resize', 'describe', 'transcribe')" },
            prompt: { type: "string", description: "Custom prompt for image description (for 'describe')" },
            language: { type: "string", description: "Language hint for transcription (for 'transcribe', e.g. 'en')" },
            max_side: { type: "number", description: "Max width/height in pixels (for 'resize', default 1024)" },
            format: { type: "string", enum: ["jpeg", "png"], description: "Output format (for 'resize', default 'jpeg')" },
            quality: { type: "number", description: "JPEG quality 1-100 (for 'resize', default 85)" },
            ttl_hours: { type: "number", description: "Remove files older than N hours (for 'cleanup', default 2)" },
          },
          required: ["action"],
        },
      },
    },
    execute: async (args) => {
      const action = args.action as string;

      switch (action) {
        case "download": {
          const url = args.url as string;
          if (!url) return { error: "url is required for download" };
          const stored = await mediaService.download(url);
          return {
            id: stored.id,
            filePath: stored.filePath,
            contentType: stored.contentType,
            size: stored.size,
            originalName: stored.originalName,
          };
        }

        case "info": {
          const fp = args.file_path as string;
          if (!fp) return { error: "file_path is required for info" };
          const info = await mediaService.imageInfo(fp);
          return info;
        }

        case "resize": {
          const fp = args.file_path as string;
          if (!fp) return { error: "file_path is required for resize" };
          const maxSide = (args.max_side as number) ?? 1024;
          const format = (args.format as "jpeg" | "png") ?? "jpeg";
          const quality = (args.quality as number) ?? 85;
          const stored = await mediaService.resize(fp, { maxSide, format, quality });
          return {
            id: stored.id,
            filePath: stored.filePath,
            contentType: stored.contentType,
            size: stored.size,
          };
        }

        case "describe": {
          if (!mediaUnderstanding) return { error: "Media understanding not available" };
          const fp = args.file_path as string;
          if (!fp) return { error: "file_path is required for describe" };
          const prompt = args.prompt as string | undefined;
          return mediaUnderstanding.describeImage(fp, prompt);
        }

        case "transcribe": {
          if (!mediaUnderstanding) return { error: "Media understanding not available" };
          const fp = args.file_path as string;
          if (!fp) return { error: "file_path is required for transcribe" };
          const language = args.language as string | undefined;
          return mediaUnderstanding.transcribeAudio(fp, { language });
        }

        case "list": {
          const files = await mediaService.list();
          return {
            files: files.map((f) => ({
              id: f.id,
              filePath: f.filePath,
              contentType: f.contentType,
              size: f.size,
              createdAt: f.createdAt,
            })),
            count: files.length,
          };
        }

        case "cleanup": {
          const ttlHours = (args.ttl_hours as number) ?? 2;
          const result = await mediaService.cleanup(ttlHours * 60 * 60 * 1000);
          return result;
        }

        default:
          return { error: `Unknown action: ${action}. Use: ${actions.join(", ")}` };
      }
    },
  };
}
