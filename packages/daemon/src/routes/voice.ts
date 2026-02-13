import type { FastifyInstance } from "fastify";

type TranscribeBody = {
  audio: string; // base64-encoded audio
  mime?: string;
  language?: string;
};

type TtsBody = {
  text: string;
  voice?: string;
  model?: string;
};

type VoiceConfig = {
  apiKey: string;
  baseUrl: string;
};

export function voiceRoutes(app: FastifyInstance, config: VoiceConfig) {
  // STT: Transcribe audio → text (OpenAI Whisper-compatible)
  app.post<{ Body: TranscribeBody }>("/chat/transcribe", async (req, reply) => {
    if (!config.apiKey) {
      return reply.code(500).send({ error: "No API key configured for voice" });
    }

    const { audio, mime, language } = req.body;
    if (!audio) {
      return reply.code(400).send({ error: "audio (base64) is required" });
    }

    const buffer = Buffer.from(audio, "base64");
    const mimeType = mime ?? "audio/webm";
    const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("wav") ? "wav" : "webm";

    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    form.append("file", blob, `recording.${ext}`);
    form.append("model", "whisper-1");
    if (language) form.append("language", language);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const baseUrl = config.baseUrl.replace(/\/+$/, "");
      const res = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: form,
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return reply.code(res.status).send({ error: `Transcription failed: ${detail || res.statusText}` });
      }

      const data = (await res.json()) as { text?: string };
      return { text: data.text?.trim() ?? "" };
    } catch (err) {
      const msg = (err as Error).name === "AbortError" ? "Transcription timed out" : String(err);
      return reply.code(500).send({ error: msg });
    } finally {
      clearTimeout(timeout);
    }
  });

  // TTS: Text → audio (OpenAI TTS-compatible)
  app.post<{ Body: TtsBody }>("/chat/tts", async (req, reply) => {
    if (!config.apiKey) {
      return reply.code(500).send({ error: "No API key configured for voice" });
    }

    const { text, voice, model } = req.body;
    if (!text) {
      return reply.code(400).send({ error: "text is required" });
    }

    const ttsModel = model ?? "gpt-4o-mini-tts";
    const ttsVoice = voice ?? "alloy";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const baseUrl = config.baseUrl.replace(/\/+$/, "");
      const res = await fetch(`${baseUrl}/audio/speech`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ttsModel,
          input: text,
          voice: ttsVoice,
          response_format: "mp3",
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return reply.code(res.status).send({ error: `TTS failed: ${detail || res.statusText}` });
      }

      const arrayBuffer = await res.arrayBuffer();
      return reply
        .header("Content-Type", "audio/mpeg")
        .header("Content-Length", arrayBuffer.byteLength)
        .send(Buffer.from(arrayBuffer));
    } catch (err) {
      const msg = (err as Error).name === "AbortError" ? "TTS timed out" : String(err);
      return reply.code(500).send({ error: msg });
    } finally {
      clearTimeout(timeout);
    }
  });
}
