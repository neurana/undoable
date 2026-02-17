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

export function voiceRoutes(app: FastifyInstance, ttsService: TtsService, sttService: SttService) {
  app.post<{ Body: TranscribeBody }>("/chat/transcribe", async (req, reply) => {
    const { audio, mime, language } = req.body;
    if (!audio) {
      return reply.code(400).send({ error: "audio (base64) is required" });
    }

    try {
      const buffer = Buffer.from(audio, "base64");
      const result = await sttService.transcribe(buffer, { mime, language });
      return { text: result.text };
    } catch (err) {
      const msg = (err as Error).name === "AbortError" ? "Transcription timed out" : String(err);
      return reply.code(500).send({ error: msg });
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
    return sttService.getStatus();
  });
}
