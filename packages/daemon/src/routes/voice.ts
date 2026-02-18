import type { FastifyInstance } from "fastify";
import type { TtsService } from "../services/tts-service.js";
import type { SttService } from "../services/stt-service.js";

type TranscribeBody = {
  audio: string; // base64-encoded audio
  mime?: string;
  language?: string;
};

type TtsBody = {
  text: string;
  voice?: string;
  format?: "mp3" | "wav" | "opus";
  speed?: number;
};

const DEFAULT_STT_MAX_AUDIO_MB = 20;

function resolveSttMaxAudioBytes(): number {
  const bytesRaw = process.env.UNDOABLE_STT_MAX_AUDIO_BYTES?.trim();
  if (bytesRaw) {
    const bytes = Number(bytesRaw);
    if (Number.isFinite(bytes) && bytes > 0) {
      return Math.floor(bytes);
    }
  }

  const mbRaw = process.env.UNDOABLE_STT_MAX_AUDIO_MB?.trim();
  if (mbRaw) {
    const mb = Number(mbRaw);
    if (Number.isFinite(mb) && mb > 0) {
      return Math.floor(mb * 1024 * 1024);
    }
  }

  return DEFAULT_STT_MAX_AUDIO_MB * 1024 * 1024;
}

function normalizeBase64(raw: string): string {
  const trimmed = raw.trim();
  const dataUrl = /^data:[^;]+;base64,(.*)$/i.exec(trimmed);
  return (dataUrl?.[1] ?? trimmed).replace(/\s+/g, "");
}

function isValidBase64(value: string): boolean {
  if (!value) return false;
  if (/[^A-Za-z0-9+/=]/.test(value)) return false;
  if (value.length % 4 !== 0) return false;
  try {
    return Buffer.from(value, "base64").length > 0;
  } catch {
    return false;
  }
}

function estimateBase64Bytes(value: string): number {
  if (!value) return 0;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

export function voiceRoutes(app: FastifyInstance, ttsService: TtsService, sttService: SttService) {
  const maxAudioBytes = resolveSttMaxAudioBytes();

  app.post<{ Body: TranscribeBody }>("/chat/transcribe", async (req, reply) => {
    const { audio, mime, language } = req.body;
    if (!audio || typeof audio !== "string") {
      return reply.code(400).send({
        error: "audio (base64) is required",
        code: "STT_AUDIO_REQUIRED",
        recovery: "Record audio again and retry.",
      });
    }

    const normalized = normalizeBase64(audio);
    if (!isValidBase64(normalized)) {
      return reply.code(400).send({
        error: "audio must be valid base64 content",
        code: "STT_AUDIO_INVALID",
        recovery: "Record audio again and retry.",
      });
    }

    const estimatedBytes = estimateBase64Bytes(normalized);
    if (estimatedBytes > maxAudioBytes) {
      return reply.code(413).send({
        error: `Audio is too large (${estimatedBytes} bytes, max ${maxAudioBytes})`,
        code: "STT_AUDIO_TOO_LARGE",
        recovery:
          "Use a shorter recording or lower audio quality. You can also increase UNDOABLE_STT_MAX_AUDIO_MB.",
      });
    }

    try {
      const buffer = Buffer.from(normalized, "base64");
      if (buffer.length > maxAudioBytes) {
        return reply.code(413).send({
          error: `Audio is too large (${buffer.length} bytes, max ${maxAudioBytes})`,
          code: "STT_AUDIO_TOO_LARGE",
          recovery:
            "Use a shorter recording or lower audio quality. You can also increase UNDOABLE_STT_MAX_AUDIO_MB.",
        });
      }

      const result = await sttService.transcribe(buffer, { mime, language });
      if (!result.text.trim()) {
        return reply.code(422).send({
          error: "No speech detected in audio.",
          code: "STT_EMPTY_TRANSCRIPT",
          recovery:
            "Try speaking closer to the microphone or in a quieter environment.",
        });
      }
      return { text: result.text };
    } catch (err) {
      const name = (err as Error).name;
      const msg = err instanceof Error ? err.message : String(err);

      if (name === "AbortError") {
        return reply.code(504).send({
          error: "Transcription timed out",
          code: "STT_TIMEOUT",
          recovery: "Try a shorter recording and retry.",
        });
      }

      if (/No STT provider configured/i.test(msg)) {
        return reply.code(503).send({
          error: msg,
          code: "STT_PROVIDER_NOT_CONFIGURED",
          recovery:
            "Add an OpenAI or Deepgram API key in provider settings, then retry.",
        });
      }

      if (/OpenAI STT failed: 401|Deepgram STT failed: 401/i.test(msg)) {
        return reply.code(401).send({
          error: "Transcription provider rejected credentials.",
          code: "STT_AUTH_FAILED",
          recovery: "Update your STT provider API key and retry.",
        });
      }

      if (/OpenAI STT failed: 429|Deepgram STT failed: 429/i.test(msg)) {
        return reply.code(429).send({
          error: "Transcription provider rate limited the request.",
          code: "STT_RATE_LIMITED",
          recovery: "Wait a moment and retry.",
        });
      }

      return reply.code(500).send({
        error: "Transcription failed",
        code: "STT_FAILED",
        detail: msg,
        recovery: "Retry once. If it keeps failing, check provider configuration.",
      });
    }
  });

  app.post<{ Body: TtsBody }>("/chat/tts", async (req, reply) => {
    const { text, voice, format, speed } = req.body;
    if (!text) {
      return reply.code(400).send({ error: "text is required" });
    }

    try {
      const audioBuffer = await ttsService.convert(text, { voice, format, speed });
      const contentType = format === "wav" ? "audio/wav" : format === "opus" ? "audio/opus" : "audio/mpeg";
      return reply
        .header("Content-Type", contentType)
        .header("Content-Length", audioBuffer.length)
        .send(audioBuffer);
    } catch (err) {
      const msg = (err as Error).name === "AbortError" ? "TTS timed out" : String(err);
      return reply.code(500).send({ error: msg });
    }
  });

  app.get("/chat/tts/status", async () => {
    return ttsService.getStatus();
  });

  app.get("/chat/stt/status", async () => {
    return { ...sttService.getStatus(), maxAudioBytes };
  });
}
