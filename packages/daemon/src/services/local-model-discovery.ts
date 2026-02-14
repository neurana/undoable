import type { ModelInfo, ModelCapabilities } from "./provider-service.js";

export type LocalProvider = "ollama" | "lmstudio";

export type LocalServerStatus = {
  provider: LocalProvider;
  available: boolean;
  baseUrl: string;
  modelCount: number;
  lastCheckedAt: number;
};

export type DiscoveredModel = ModelInfo & {
  local: true;
  size?: number;
  family?: string;
  parameterSize?: string;
};

type OllamaModel = {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    family?: string;
    parameter_size?: string;
  };
};

type OllamaTagsResponse = {
  models: OllamaModel[];
};

type LMStudioModel = {
  id: string;
  object: string;
  owned_by?: string;
};

type LMStudioModelsResponse = {
  data: LMStudioModel[];
};

const OLLAMA_API_URL = "http://127.0.0.1:11434";
const OLLAMA_OPENAI_URL = "http://127.0.0.1:11434/v1";
const LMSTUDIO_URL = "http://127.0.0.1:1234/v1";
const DISCOVERY_TIMEOUT_MS = 5_000;
const REFRESH_INTERVAL_MS = 30_000;

function inferCapabilities(modelId: string): ModelCapabilities {
  const id = modelId.toLowerCase();
  const isReasoning = id.includes("r1") || id.includes("reasoning") || id.includes("think");
  const hasVision = id.includes("vision") || id.includes("llava") || id.includes("bakllava");
  const isTagReasoning = isReasoning && (id.includes("deepseek") || id.includes("qwen"));
  return {
    thinking: isReasoning,
    tagReasoning: isTagReasoning,
    vision: hasVision,
    tools: !id.includes("r1:"),
  };
}

async function fetchWithTimeout(url: string, timeoutMs = DISCOVERY_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
}

async function discoverOllamaModels(): Promise<DiscoveredModel[]> {
  try {
    const res = await fetchWithTimeout(`${OLLAMA_API_URL}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as OllamaTagsResponse;
    if (!data.models?.length) return [];

    return data.models.map((m): DiscoveredModel => ({
      id: m.name,
      name: m.name,
      provider: "ollama",
      capabilities: inferCapabilities(m.name),
      contextWindow: 128_000,
      local: true,
      size: m.size,
      family: m.details?.family,
      parameterSize: m.details?.parameter_size,
    }));
  } catch {
    return [];
  }
}

async function discoverLMStudioModels(): Promise<DiscoveredModel[]> {
  try {
    const res = await fetchWithTimeout(`${LMSTUDIO_URL}/models`);
    if (!res.ok) return [];
    const data = (await res.json()) as LMStudioModelsResponse;
    if (!data.data?.length) return [];

    return data.data.map((m): DiscoveredModel => ({
      id: m.id,
      name: m.id,
      provider: "lmstudio",
      capabilities: inferCapabilities(m.id),
      contextWindow: 128_000,
      local: true,
    }));
  } catch {
    return [];
  }
}

async function isServerReachable(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url, 3_000);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

export class LocalModelDiscovery {
  private ollamaModels: DiscoveredModel[] = [];
  private lmstudioModels: DiscoveredModel[] = [];
  private ollamaAvailable = false;
  private lmstudioAvailable = false;
  private lastRefreshAt = 0;
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshing = false;

  async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;

    try {
      const [ollamaReachable, lmstudioReachable] = await Promise.all([
        isServerReachable(`${OLLAMA_API_URL}/api/tags`),
        isServerReachable(`${LMSTUDIO_URL}/models`),
      ]);

      this.ollamaAvailable = ollamaReachable;
      this.lmstudioAvailable = lmstudioReachable;

      const [ollama, lmstudio] = await Promise.all([
        ollamaReachable ? discoverOllamaModels() : Promise.resolve([]),
        lmstudioReachable ? discoverLMStudioModels() : Promise.resolve([]),
      ]);

      this.ollamaModels = ollama;
      this.lmstudioModels = lmstudio;
      this.lastRefreshAt = Date.now();
    } finally {
      this.refreshing = false;
    }
  }

  startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getModels(provider?: LocalProvider): DiscoveredModel[] {
    if (provider === "ollama") return [...this.ollamaModels];
    if (provider === "lmstudio") return [...this.lmstudioModels];
    return [...this.ollamaModels, ...this.lmstudioModels];
  }

  getServerStatus(): LocalServerStatus[] {
    return [
      {
        provider: "ollama",
        available: this.ollamaAvailable,
        baseUrl: OLLAMA_OPENAI_URL,
        modelCount: this.ollamaModels.length,
        lastCheckedAt: this.lastRefreshAt,
      },
      {
        provider: "lmstudio",
        available: this.lmstudioAvailable,
        baseUrl: LMSTUDIO_URL,
        modelCount: this.lmstudioModels.length,
        lastCheckedAt: this.lastRefreshAt,
      },
    ];
  }

  isAvailable(provider: LocalProvider): boolean {
    return provider === "ollama" ? this.ollamaAvailable : this.lmstudioAvailable;
  }

  getBaseUrl(provider: LocalProvider): string {
    return provider === "ollama" ? OLLAMA_OPENAI_URL : LMSTUDIO_URL;
  }

  isLocalProvider(provider: string): boolean {
    return provider === "ollama" || provider === "lmstudio";
  }

  isLocalModel(modelId: string): boolean {
    return this.ollamaModels.some((m) => m.id === modelId)
      || this.lmstudioModels.some((m) => m.id === modelId);
  }

  resolveProvider(modelId: string): LocalProvider | null {
    if (this.ollamaModels.some((m) => m.id === modelId)) return "ollama";
    if (this.lmstudioModels.some((m) => m.id === modelId)) return "lmstudio";
    return null;
  }
}
