export type TtsProvider = "openai" | "edge-tts" | "elevenlabs";

export type TtsOptions = {
  voice?: string;
  format?: "mp3" | "wav" | "opus";
  speed?: number;
};

export type TtsStatus = {
  enabled: boolean;
  provider: TtsProvider;
  providers: TtsProvider[];
};

const DEFAULT_VOICES: Record<TtsProvider, string> = {
  openai: "alloy",
  "edge-tts": "en-US-AriaNeural",
  elevenlabs: "Rachel",
};

export class TtsService {
  private provider: TtsProvider = "openai";
  private enabled = false;
  private apiKeys: Record<string, string> = {};
  private baseUrls: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    elevenlabs: "https://api.elevenlabs.io/v1",
  };

  setProvider(p: TtsProvider): void {
    this.provider = p;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
  }

  setApiKey(provider: string, key: string): void {
    this.apiKeys[provider] = key.trim();
  }

  setBaseUrl(provider: string, url: string): void {
    this.baseUrls[provider] = url.trim();
  }

  getStatus(): TtsStatus {
    const providers: TtsProvider[] = [];
    if (this.hasProviderKey("openai")) providers.push("openai");
    if (this.isEdgeTtsAvailable()) providers.push("edge-tts");
    if (this.hasProviderKey("elevenlabs")) providers.push("elevenlabs");

    const provider = providers.includes(this.provider)
      ? this.provider
      : (providers[0] ?? this.provider);

    return { enabled: this.enabled, provider, providers };
  }

  async convert(text: string, opts?: TtsOptions): Promise<Buffer> {
    const provider = this.resolveProvider();
    if (!provider) {
      throw new Error(
        "No TTS provider configured. Set OPENAI_API_KEY, install edge-tts, or set ELEVENLABS_API_KEY.",
      );
    }
    this.provider = provider;

    switch (provider) {
      case "openai":
        return this.convertOpenAI(text, opts);
      case "edge-tts":
        return this.convertEdgeTts(text, opts);
      case "elevenlabs":
        return this.convertElevenLabs(text, opts);
      default:
        throw new Error(`Unknown TTS provider: ${this.provider}`);
    }
  }

  private hasProviderKey(provider: "openai" | "elevenlabs"): boolean {
    return (this.apiKeys[provider] ?? "").trim().length > 0;
  }

  private resolveProvider(): TtsProvider | null {
    if (this.provider === "openai" && this.hasProviderKey("openai")) {
      return "openai";
    }
    if (this.provider === "edge-tts" && this.isEdgeTtsAvailable()) {
      return "edge-tts";
    }
    if (this.provider === "elevenlabs" && this.hasProviderKey("elevenlabs")) {
      return "elevenlabs";
    }
    if (this.hasProviderKey("openai")) {
      return "openai";
    }
    if (this.isEdgeTtsAvailable()) {
      return "edge-tts";
    }
    if (this.hasProviderKey("elevenlabs")) {
      return "elevenlabs";
    }
    return null;
  }

  private async convertOpenAI(text: string, opts?: TtsOptions): Promise<Buffer> {
    const apiKey = this.apiKeys["openai"];
    if (!apiKey) throw new Error("OpenAI API key not configured for TTS");

    const baseUrl = (this.baseUrls["openai"] ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const voice = opts?.voice ?? DEFAULT_VOICES.openai;
    const format = opts?.format ?? "mp3";
    const speed = opts?.speed ?? 1.0;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${baseUrl}/audio/speech`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          input: text,
          voice,
          response_format: format,
          speed,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`OpenAI TTS failed: ${res.status} ${detail}`);
      }

      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  }

  private async convertEdgeTts(text: string, opts?: TtsOptions): Promise<Buffer> {
    const edgeTts = await this.loadEdgeTts();
    const voice = opts?.voice ?? DEFAULT_VOICES["edge-tts"];
    const result = await edgeTts.synthesize(text, { voice });
    return Buffer.from(result.audio);
  }

  private async convertElevenLabs(text: string, opts?: TtsOptions): Promise<Buffer> {
    const apiKey = this.apiKeys["elevenlabs"];
    if (!apiKey) throw new Error("ElevenLabs API key not configured");

    const voice = opts?.voice ?? DEFAULT_VOICES.elevenlabs;
    const baseUrl = (this.baseUrls["elevenlabs"] ?? "https://api.elevenlabs.io/v1").replace(/\/+$/, "");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${baseUrl}/text-to-speech/${encodeURIComponent(voice)}`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`ElevenLabs TTS failed: ${res.status} ${detail}`);
      }

      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  }

  private isEdgeTtsAvailable(): boolean {
    try {
      require.resolve("edge-tts");
      return true;
    } catch {
      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadEdgeTts(): Promise<any> {
    try {
      const mod = "edge-tts";
      return (await import(/* webpackIgnore: true */ mod)).default;
    } catch {
      throw new Error("edge-tts is not installed. Run: pnpm add edge-tts");
    }
  }
}
