import * as fsp from "node:fs/promises";
import * as path from "node:path";
import os from "node:os";
import { LocalModelDiscovery, type DiscoveredModel, type LocalProvider } from "./local-model-discovery.js";
import { decryptSecret, encryptSecret, resolveSecretKey } from "./secrets-crypto.js";

/**
 * Provider and model management for Undoable.
 *
 * Tracks available providers, API keys, model catalog with capabilities,
 * and the currently active model.
 */

export type ModelCapabilities = {
  thinking: boolean;
  tagReasoning: boolean;
  vision: boolean;
  tools: boolean;
};

export type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  capabilities: ModelCapabilities;
  contextWindow?: number;
  local?: boolean;
  streaming?: boolean;
};

export type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ModelInfo[];
};

export type ActiveModel = {
  provider: string;
  model: string;
  name: string;
  capabilities: ModelCapabilities;
};

export type ProvidersState = {
  version?: 1;
  providers: ProviderStateEntry[];
  activeProvider: string;
  activeModel: string;
};

type ProviderStateEntry = Omit<ProviderConfig, "apiKey"> & {
  apiKey?: string;
  apiKeyEncrypted?: string;
};

const PROVIDERS_FILE = path.join(os.homedir(), ".undoable", "providers.json");

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  thinking: false, tagReasoning: false, vision: false, tools: true,
};

const MODEL_ALIASES: Record<string, string> = {
  "gpt5": "gpt-5.2",
  "gpt-5-latest": "gpt-5.2",
  "claude": "claude-opus-4-6-20260204",
  "opus": "claude-opus-4-6-20260204",
  "sonnet": "claude-sonnet-4-5-20250514",
  "haiku": "claude-haiku-3-5-20241022",
  "deepseek": "deepseek-chat",
  "gemini": "gemini-3-pro-preview",
  "fast": "gpt-4.1-mini",
  "cheap": "gpt-4.1-mini",
  "smart": "gpt-5.2",
  "best": "gpt-5.2-pro",
};

// Built-in model catalog (updated Feb 2026)
const KNOWN_MODELS: ModelInfo[] = [
  // ── OpenAI (GPT-5 family) ──
  { id: "gpt-5.2", name: "GPT-5.2", provider: "openai", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 1047576 },
  { id: "gpt-5.2-pro", name: "GPT-5.2 Pro", provider: "openai", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 1047576 },
  { id: "gpt-5.1", name: "GPT-5.1", provider: "openai", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 1047576 },
  { id: "gpt-5", name: "GPT-5", provider: "openai", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 1047576 },
  { id: "gpt-5-mini", name: "GPT-5 Mini", provider: "openai", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 1047576 },
  { id: "gpt-5-nano", name: "GPT-5 Nano", provider: "openai", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 1047576 },
  // OpenAI reasoning models
  { id: "o3", name: "o3", provider: "openai", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 200000 },
  { id: "o3-pro", name: "o3 Pro", provider: "openai", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 200000 },
  { id: "o4-mini", name: "o4 Mini", provider: "openai", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 200000 },
  // OpenAI legacy (still available)
  { id: "gpt-4.1", name: "GPT-4.1", provider: "openai", capabilities: { thinking: false, tagReasoning: false, vision: true, tools: true }, contextWindow: 1047576 },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai", capabilities: { thinking: false, tagReasoning: false, vision: true, tools: true }, contextWindow: 1047576 },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", capabilities: { thinking: false, tagReasoning: false, vision: true, tools: true }, contextWindow: 128000 },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", capabilities: { thinking: false, tagReasoning: false, vision: true, tools: true }, contextWindow: 128000 },

  // ── Anthropic (Claude 4.x family) ──
  { id: "claude-opus-4-6-20260204", name: "Claude Opus 4.6", provider: "anthropic", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 200000 },
  { id: "claude-opus-4-5-20250826", name: "Claude Opus 4.5", provider: "anthropic", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 200000 },
  { id: "claude-sonnet-4-5-20250514", name: "Claude Sonnet 4.5", provider: "anthropic", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 200000 },
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 200000 },
  { id: "claude-haiku-3-5-20241022", name: "Claude 3.5 Haiku", provider: "anthropic", capabilities: { thinking: false, tagReasoning: false, vision: true, tools: true }, contextWindow: 200000 },

  // ── DeepSeek ──
  { id: "deepseek-chat", name: "DeepSeek V3.2", provider: "deepseek", capabilities: { thinking: true, tagReasoning: true, vision: false, tools: true }, contextWindow: 64000 },
  { id: "deepseek-reasoner", name: "DeepSeek R1", provider: "deepseek", capabilities: { thinking: true, tagReasoning: true, vision: false, tools: false }, contextWindow: 64000 },

  // ── Google Gemini ──
  { id: "gemini-3-pro-preview", name: "Gemini 3 Pro", provider: "google", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 1048576 },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", provider: "google", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 1048576 },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 1048576 },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google", capabilities: { thinking: true, tagReasoning: false, vision: true, tools: true }, contextWindow: 1048576 },

  // ── Ollama (local) ──
  { id: "llama3.3", name: "Llama 3.3 70B", provider: "ollama", capabilities: { thinking: false, tagReasoning: false, vision: false, tools: true } },
  { id: "qwen3:8b", name: "Qwen 3 8B", provider: "ollama", capabilities: { thinking: true, tagReasoning: true, vision: false, tools: true } },
  { id: "deepseek-r1:8b", name: "DeepSeek R1 8B", provider: "ollama", capabilities: { thinking: true, tagReasoning: true, vision: false, tools: false } },
];

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: "", models: [] },
  { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com/v1", apiKey: "", models: [] },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com", apiKey: "", models: [] },
  { id: "google", name: "Google AI", baseUrl: "https://generativelanguage.googleapis.com/v1beta", apiKey: "", models: [] },
  { id: "ollama", name: "Ollama (Local)", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "ollama", models: [] },
  { id: "lmstudio", name: "LM Studio (Local)", baseUrl: "http://127.0.0.1:1234/v1", apiKey: "lm-studio", models: [] },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "", models: [] },
];

export class ProviderService {
  private providers: ProviderConfig[] = [];
  private activeProvider = "";
  private activeModel = "";
  private localDiscovery = new LocalModelDiscovery();
  private discoveredModels: DiscoveredModel[] = [];
  private secretKey: Buffer | null = null;
  private secretKeyInitialized = false;

  async init(initialApiKey: string, initialModel: string, initialBaseUrl: string): Promise<void> {
    await this.loadState();

    if (this.providers.length === 0) {
      this.providers = DEFAULT_PROVIDERS.map((p) => ({ ...p, models: [] }));
    }

    this.ensureLocalProviders();
    await this.refreshLocalModels();
    this.localDiscovery.startAutoRefresh();

    if (!this.activeProvider || !this.activeModel) {
      const detectedProvider = this.detectProvider(initialBaseUrl, initialModel);
      this.activeProvider = detectedProvider;
      this.activeModel = initialModel;

      const provider = this.providers.find((p) => p.id === detectedProvider);
      if (provider && initialApiKey && !provider.apiKey) {
        provider.apiKey = initialApiKey;
        provider.baseUrl = initialBaseUrl;
      }
    }

    await this.saveState();
  }

  async destroy(): Promise<void> {
    this.localDiscovery.stopAutoRefresh();
  }

  async refreshLocalModels(): Promise<void> {
    await this.localDiscovery.refresh();
    this.discoveredModels = this.localDiscovery.getModels();
  }

  private ensureLocalProviders(): void {
    for (const lp of ["ollama", "lmstudio"] as const) {
      if (!this.providers.find((p) => p.id === lp)) {
        const def = DEFAULT_PROVIDERS.find((p) => p.id === lp);
        if (def) this.providers.push({ ...def, models: [] });
      }
    }
  }

  private detectProvider(baseUrl: string, model: string): string {
    const url = baseUrl.toLowerCase();
    if (url.includes("openai.com")) return "openai";
    if (url.includes("anthropic.com")) return "anthropic";
    if (url.includes("deepseek.com")) return "deepseek";
    if (url.includes("googleapis.com") || url.includes("generativelanguage")) return "google";
    if (url.includes("127.0.0.1:11434") || url.includes("localhost:11434")) return "ollama";
    if (url.includes("127.0.0.1:1234") || url.includes("localhost:1234")) return "lmstudio";
    if (url.includes("openrouter.ai")) return "openrouter";
    const m = model.toLowerCase();
    if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return "openai";
    if (m.startsWith("claude")) return "anthropic";
    if (m.startsWith("deepseek")) return "deepseek";
    if (m.startsWith("gemini")) return "google";
    return "openai";
  }

  getActive(): ActiveModel {
    const info = this.getModelInfo(this.activeModel);
    return {
      provider: this.activeProvider,
      model: this.activeModel,
      name: info?.name ?? this.activeModel,
      capabilities: info?.capabilities ?? DEFAULT_CAPABILITIES,
    };
  }

  getActiveConfig(): { apiKey: string; baseUrl: string; model: string; provider: string } {
    const provider = this.providers.find((p) => p.id === this.activeProvider);
    return {
      apiKey: provider?.apiKey ?? "",
      baseUrl: provider?.baseUrl ?? "https://api.openai.com/v1",
      model: this.activeModel,
      provider: this.activeProvider,
    };
  }

  getModelInfo(modelId: string): ModelInfo | undefined {
    const discovered = this.discoveredModels.find((m) => m.id === modelId);
    if (discovered) return discovered;
    return KNOWN_MODELS.find((m) => m.id === modelId);
  }

  modelSupportsThinking(modelId?: string): boolean {
    const id = modelId ?? this.activeModel;
    const info = this.getModelInfo(id);
    return info?.capabilities.thinking ?? false;
  }

  modelUsesTagReasoning(modelId?: string): boolean {
    const id = modelId ?? this.activeModel;
    const info = this.getModelInfo(id);
    return info?.capabilities.tagReasoning ?? false;
  }

  listModelsForProvider(providerId: string): ModelInfo[] {
    const known = KNOWN_MODELS.filter((m) => m.provider === providerId);
    const discovered = this.discoveredModels
      .filter((m) => m.provider === providerId)
      .filter((m) => !known.some((k) => k.id === m.id));
    return [...known, ...discovered];
  }

  listAllModels(): ModelInfo[] {
    const discovered = this.discoveredModels.filter(
      (m) => !KNOWN_MODELS.some((k) => k.id === m.id),
    );
    return [...KNOWN_MODELS, ...discovered];
  }

  listProviders(): Array<{ id: string; name: string; baseUrl: string; hasKey: boolean; modelCount: number; local: boolean; available: boolean }> {
    return this.providers.map((p) => {
      const isLocal = this.localDiscovery.isLocalProvider(p.id);
      return {
        id: p.id,
        name: p.name,
        baseUrl: p.baseUrl,
        hasKey: !!p.apiKey,
        modelCount: this.listModelsForProvider(p.id).length,
        local: isLocal,
        available: isLocal ? this.localDiscovery.isAvailable(p.id as LocalProvider) : !!p.apiKey,
      };
    });
  }

  getLocalServers() {
    return this.localDiscovery.getServerStatus();
  }

  isLocalModel(modelId: string): boolean {
    return this.localDiscovery.isLocalModel(modelId);
  }

  shouldDisableStreaming(modelId: string): boolean {
    const provider = this.localDiscovery.resolveProvider(modelId);
    return provider === "ollama";
  }

  resolveModelAlias(input: string): { providerId: string; modelId: string } | null {
    const normalized = input.trim().toLowerCase();
    if (!normalized) return null;

    // 1. Check alias map
    const aliasTarget = MODEL_ALIASES[normalized];
    if (aliasTarget) {
      const info = KNOWN_MODELS.find((m) => m.id === aliasTarget);
      if (info) return { providerId: info.provider, modelId: info.id };
    }

    // 2. Exact match in known models
    const exact = KNOWN_MODELS.find((m) => m.id === normalized);
    if (exact) return { providerId: exact.provider, modelId: exact.id };

    // 3. Exact match in discovered models
    const discovered = this.discoveredModels.find((m) => m.id === normalized);
    if (discovered) return { providerId: discovered.provider, modelId: discovered.id };

    // 4. Prefix match (e.g. "gpt-5" matches "gpt-5.2")
    const prefixMatch = KNOWN_MODELS.find((m) => m.id.startsWith(normalized));
    if (prefixMatch) return { providerId: prefixMatch.provider, modelId: prefixMatch.id };

    // 5. Name match (case-insensitive)
    const nameMatch = KNOWN_MODELS.find((m) => m.name.toLowerCase() === normalized);
    if (nameMatch) return { providerId: nameMatch.provider, modelId: nameMatch.id };

    return null;
  }

  async setActiveModel(providerId: string, modelId: string): Promise<ActiveModel | null> {
    const provider = this.providers.find((p) => p.id === providerId);
    if (!provider) return null;
    const isLocal = this.localDiscovery.isLocalProvider(providerId);
    if (!provider.apiKey && !isLocal) return null;
    this.activeProvider = providerId;
    this.activeModel = modelId;
    await this.saveState();
    return this.getActive();
  }

  async setProviderKey(providerId: string, apiKey: string, baseUrl?: string): Promise<boolean> {
    let provider = this.providers.find((p) => p.id === providerId);
    if (!provider) {
      provider = { id: providerId, name: providerId, baseUrl: baseUrl ?? "", apiKey, models: [] };
      this.providers.push(provider);
    } else {
      provider.apiKey = apiKey;
      if (baseUrl) provider.baseUrl = baseUrl;
    }
    await this.saveState();
    return true;
  }

  async removeProviderKey(providerId: string): Promise<boolean> {
    const provider = this.providers.find((p) => p.id === providerId);
    if (!provider) return false;
    provider.apiKey = "";
    await this.saveState();
    return true;
  }

  private async ensureSecretKey(): Promise<void> {
    if (this.secretKeyInitialized) return;
    const resolved = await resolveSecretKey();
    this.secretKey = resolved.key;
    this.secretKeyInitialized = true;
  }

  private hydrateProvider(entry: ProviderStateEntry): ProviderConfig {
    const legacyApiKey = typeof entry.apiKey === "string" ? entry.apiKey : "";
    let apiKey = legacyApiKey;

    if (typeof entry.apiKeyEncrypted === "string" && this.secretKey) {
      const decrypted = decryptSecret(entry.apiKeyEncrypted, this.secretKey);
      if (decrypted !== null) {
        apiKey = decrypted;
      }
    }

    return {
      id: entry.id,
      name: entry.name,
      baseUrl: entry.baseUrl,
      apiKey,
      models: entry.models ?? [],
    };
  }

  private toStateProvider(provider: ProviderConfig): ProviderStateEntry {
    const entry: ProviderStateEntry = {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      models: provider.models,
    };

    const key = provider.apiKey.trim();
    if (!key) return entry;

    if (this.secretKey) {
      return {
        ...entry,
        apiKeyEncrypted: encryptSecret(key, this.secretKey),
      };
    }

    // Fallback for environments where a local secret key cannot be resolved.
    return {
      ...entry,
      apiKey: key,
    };
  }

  private async loadState(): Promise<void> {
    await this.ensureSecretKey();
    try {
      const raw = await fsp.readFile(PROVIDERS_FILE, "utf-8");
      const state = JSON.parse(raw) as ProvidersState;
      const providers = Array.isArray(state.providers) ? state.providers : [];
      this.providers = providers.map((entry) => this.hydrateProvider(entry));
      this.activeProvider = state.activeProvider ?? "";
      this.activeModel = state.activeModel ?? "";
    } catch {
      // File doesn't exist yet, will be created on save
    }
  }

  private async saveState(): Promise<void> {
    await this.ensureSecretKey();
    const dir = path.dirname(PROVIDERS_FILE);
    await fsp.mkdir(dir, { recursive: true });
    const state: ProvidersState = {
      version: 1,
      providers: this.providers.map((provider) => this.toStateProvider(provider)),
      activeProvider: this.activeProvider,
      activeModel: this.activeModel,
    };
    await fsp.writeFile(PROVIDERS_FILE, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
    await fsp.chmod(PROVIDERS_FILE, 0o600).catch(() => {
      // best effort
    });
  }
}
