export type SttProvider = "openai" | "deepgram";

export type SttOptions = {
  language?: string;
  model?: string;
};

export type SttStatus = {
  provider: SttProvider;
  providers: SttProvider[];
};

export class SttService {
  private provider: SttProvider = "openai";
  private apiKeys: Record<string, string> = {};
  private baseUrls: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    deepgram: "https://api.deepgram.com/v1",
  };

  setProvider(p: SttProvider): void {
    this.provider = p;
  }

  setApiKey(provider: string, key: string): void {
    this.apiKeys[provider] = key.trim();
  }

  setBaseUrl(provider: string, url: string): void {
    this.baseUrls[provider] = url.trim();
  }

  getStatus(): SttStatus {
    const providers: SttProvider[] = [];
    if (this.hasProviderKey("openai")) providers.push("openai");
    if (this.hasProviderKey("deepgram")) providers.push("deepgram");

    const provider = providers.includes(this.provider)
      ? this.provider
      : (providers[0] ?? this.provider);

    return { provider, providers };
  }

  async transcribe(audio: Buffer, opts?: SttOptions & { mime?: string }): Promise<{ text: string }> {
    const provider = this.resolveProvider();
    if (!provider) {
      throw new Error(
        "No STT provider configured. Set OPENAI_API_KEY or DEEPGRAM_API_KEY.",
      );
    }
    this.provider = provider;

    switch (provider) {
      case "openai":
        return this.transcribeOpenAI(audio, opts?.mime ?? "audio/webm", opts ?? {});
      case "deepgram":
        return this.transcribeDeepgram(audio, opts?.mime ?? "audio/webm", opts ?? {});
      default:
        throw new Error(`Unknown STT provider: ${this.provider}`);
    }
  }

  private hasProviderKey(provider: SttProvider): boolean {
    return (this.apiKeys[provider] ?? "").trim().length > 0;
  }

  private resolveProvider(): SttProvider | null {
    if (this.provider === "openai" && this.hasProviderKey("openai")) {
      return "openai";
    }
    if (this.provider === "deepgram" && this.hasProviderKey("deepgram")) {
      return "deepgram";
    }
    if (this.hasProviderKey("openai")) {
      return "openai";
    }
    if (this.hasProviderKey("deepgram")) {
      return "deepgram";
    }
    return null;
  }

  private async transcribeOpenAI(audio: Buffer, mime: string, opts: SttOptions): Promise<{ text: string }> {
    const apiKey = this.apiKeys["openai"];
    if (!apiKey) throw new Error("OpenAI API key not configured for STT");

    const baseUrl = (this.baseUrls["openai"] ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const lowerMime = mime.toLowerCase();
    const ext = lowerMime.includes("mp4") || lowerMime.includes("m4a")
      ? "m4a"
      : lowerMime.includes("wav")
        ? "wav"
        : lowerMime.includes("ogg")
          ? "ogg"
          : lowerMime.includes("mpeg") || lowerMime.includes("mp3")
            ? "mp3"
            : "webm";

    const form = new FormData();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob = new Blob([audio as any], { type: mime });
    form.append("file", blob, `recording.${ext}`);
    form.append("model", opts.model ?? "whisper-1");
    if (opts.language) form.append("language", opts.language);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`OpenAI STT failed: ${res.status} ${detail}`);
      }

      const data = (await res.json()) as { text?: string };
      return { text: data.text?.trim() ?? "" };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async transcribeDeepgram(audio: Buffer, mime: string, opts: SttOptions): Promise<{ text: string }> {
    const apiKey = this.apiKeys["deepgram"];
    if (!apiKey) throw new Error("Deepgram API key not configured");

    const baseUrl = (this.baseUrls["deepgram"] ?? "https://api.deepgram.com/v1").replace(/\/+$/, "");
    const params = new URLSearchParams({ model: opts.model ?? "nova-3" });
    if (opts.language) params.set("language", opts.language);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${baseUrl}/listen?${params}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": mime,
        },
        body: audio,
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Deepgram STT failed: ${res.status} ${detail}`);
      }

      const data = (await res.json()) as {
        results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
      };
      const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
      return { text: transcript.trim() };
    } finally {
      clearTimeout(timeout);
    }
  }
}
