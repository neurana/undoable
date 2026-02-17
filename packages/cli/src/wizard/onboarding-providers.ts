import * as fs from "node:fs";
import type { WizardPrompter } from "./prompts.js";
import { ensureUndoableDir, PROVIDERS_FILE } from "./onboarding-helpers.js";

type ModelInfo = {
  id: string;
  name: string;
  provider: string;
};

type ProviderDef = {
  id: string;
  name: string;
  baseUrl: string;
  hint?: string;
  local?: boolean;
  models: ModelInfo[];
};

const PROVIDERS: ProviderDef[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    hint: "GPT-5.2, GPT-4.1, o3, o4",
    models: [
      { id: "gpt-5.2", name: "GPT-5.2", provider: "openai" },
      { id: "gpt-5.2-pro", name: "GPT-5.2 Pro", provider: "openai" },
      { id: "gpt-5.1", name: "GPT-5.1", provider: "openai" },
      { id: "gpt-5", name: "GPT-5", provider: "openai" },
      { id: "gpt-4.1", name: "GPT-4.1", provider: "openai" },
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai" },
      { id: "o3", name: "o3", provider: "openai" },
      { id: "o3-pro", name: "o3 Pro", provider: "openai" },
      { id: "o4-mini", name: "o4 Mini", provider: "openai" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    hint: "Claude Opus 4.6, Sonnet 4.5, Haiku",
    models: [
      {
        id: "claude-opus-4-6-20260204",
        name: "Claude Opus 4.6",
        provider: "anthropic",
      },
      {
        id: "claude-opus-4-5-20250826",
        name: "Claude Opus 4.5",
        provider: "anthropic",
      },
      {
        id: "claude-sonnet-4-5-20250514",
        name: "Claude Sonnet 4.5",
        provider: "anthropic",
      },
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        provider: "anthropic",
      },
      {
        id: "claude-haiku-3-5-20241022",
        name: "Claude 3.5 Haiku",
        provider: "anthropic",
      },
    ],
  },
  {
    id: "google",
    name: "Google AI",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    hint: "Gemini 3 Pro, Gemini 2.5",
    models: [
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro", provider: "google" },
      {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash",
        provider: "google",
      },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    hint: "DeepSeek V3.2, R1",
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3.2", provider: "deepseek" },
      { id: "deepseek-reasoner", name: "DeepSeek R1", provider: "deepseek" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    hint: "100+ models via unified API",
    models: [],
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    baseUrl: "http://127.0.0.1:11434/v1",
    hint: "Run models locally",
    local: true,
    models: [
      { id: "llama3.3", name: "Llama 3.3 70B", provider: "ollama" },
      { id: "qwen3:8b", name: "Qwen 3 8B", provider: "ollama" },
      { id: "deepseek-r1:8b", name: "DeepSeek R1 8B", provider: "ollama" },
    ],
  },
  {
    id: "lmstudio",
    name: "LM Studio (Local)",
    baseUrl: "http://127.0.0.1:1234/v1",
    hint: "Any GGUF model",
    local: true,
    models: [],
  },
];

export type ProviderSelection = {
  providerId: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  modelName: string;
};

export async function setupProviders(
  prompter: WizardPrompter,
): Promise<ProviderSelection | null> {
  const providerId = await prompter.select<string>({
    message: "Model / auth provider",
    options: [
      ...PROVIDERS.map((p) => ({
        value: p.id,
        label: p.name,
        hint: p.hint,
      })),
      {
        value: "skip",
        label: "Skip for now",
        hint: "Configure later with nrn config",
      },
    ],
  });

  if (providerId === "skip") return null;

  const provider = PROVIDERS.find((p) => p.id === providerId)!;
  let apiKey = "";

  if (!provider.local) {
    const envKeyMap: Record<string, string> = {
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      google: "GOOGLE_API_KEY",
      deepseek: "DEEPSEEK_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
    };

    const envName =
      envKeyMap[providerId] ?? `${providerId.toUpperCase()}_API_KEY`;
    const existingKey = process.env[envName] ?? "";

    if (existingKey) {
      const masked = `${existingKey.slice(0, 6)}...${existingKey.slice(-4)}`;
      const useExisting = await prompter.confirm({
        message: `Found ${envName} (${masked}). Use it?`,
        initialValue: true,
      });
      if (useExisting) {
        apiKey = existingKey;
      }
    }

    if (!apiKey) {
      apiKey = await prompter.text({
        message: `${provider.name} API key`,
        placeholder: envName,
        validate: (v) => (v.trim() ? undefined : "API key is required"),
      });
    }
  }

  let modelId = "";
  let modelName = "";

  if (provider.models.length > 0) {
    const selected = await prompter.select<string>({
      message: "Default model",
      options: provider.models.map((m) => ({
        value: m.id,
        label: m.name,
      })),
      initialValue: provider.models[0]?.id,
    });
    modelId = selected;
    modelName =
      provider.models.find((m) => m.id === selected)?.name ?? selected;
  } else if (providerId === "openrouter") {
    modelId = await prompter.text({
      message: "Model ID (e.g. anthropic/claude-opus-4.6)",
      validate: (v) => (v.trim() ? undefined : "Model ID is required"),
    });
    modelName = modelId;
  } else if (provider.local) {
    modelId = await prompter.text({
      message: "Model name (e.g. llama3.3)",
      placeholder: "llama3.3",
      validate: (v) => (v.trim() ? undefined : "Model name is required"),
    });
    modelName = modelId;
  }

  const selection: ProviderSelection = {
    providerId,
    providerName: provider.name,
    baseUrl: provider.baseUrl,
    apiKey,
    modelId,
    modelName,
  };

  writeProvidersState(selection);
  return selection;
}

function writeProvidersState(selection: ProviderSelection) {
  ensureUndoableDir();

  const providers = PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    ...(p.id === selection.providerId && selection.apiKey
      ? { apiKey: selection.apiKey }
      : {}),
    models: [],
  }));

  const state = {
    version: 1,
    providers,
    activeProvider: selection.providerId,
    activeModel: selection.modelId,
  };

  fs.writeFileSync(
    PROVIDERS_FILE,
    `${JSON.stringify(state, null, 2)}\n`,
    "utf-8",
  );
}
