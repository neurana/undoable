import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");

describe("ProviderService secret persistence", () => {
  const originalHome = process.env.HOME;
  const originalSecretsKey = process.env.UNDOABLE_SECRETS_KEY;
  const originalSecretsKeyFile = process.env.UNDOABLE_SECRETS_KEY_FILE;

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalSecretsKey === undefined) {
      delete process.env.UNDOABLE_SECRETS_KEY;
    } else {
      process.env.UNDOABLE_SECRETS_KEY = originalSecretsKey;
    }

    if (originalSecretsKeyFile === undefined) {
      delete process.env.UNDOABLE_SECRETS_KEY_FILE;
    } else {
      process.env.UNDOABLE_SECRETS_KEY_FILE = originalSecretsKeyFile;
    }
  });

  it("encrypts provider API keys at rest", async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-providers-"));
    process.env.HOME = homeDir;
    process.env.UNDOABLE_SECRETS_KEY = ENCRYPTION_KEY;

    const { ProviderService } = await loadProviderServiceModule();
    const service = new ProviderService();
    await service.init("", "gpt-4.1-mini", "https://api.openai.com/v1");

    await service.setProviderKey("openai", "sk-secret-value", "https://api.openai.com/v1");

    const providersFile = path.join(homeDir, ".undoable", "providers.json");
    const raw = await fs.readFile(providersFile, "utf-8");
    expect(raw).not.toContain("sk-secret-value");

    const parsed = JSON.parse(raw) as {
      providers: Array<{ id: string; apiKey?: string; apiKeyEncrypted?: string }>;
    };
    const openai = parsed.providers.find((p) => p.id === "openai");
    expect(openai?.apiKeyEncrypted).toBeTruthy();
    expect(openai?.apiKey).toBeUndefined();

    await service.destroy();
  });

  it("loads legacy plaintext keys and rewrites encrypted state", async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-providers-legacy-"));
    process.env.HOME = homeDir;
    process.env.UNDOABLE_SECRETS_KEY = ENCRYPTION_KEY;

    const undoableDir = path.join(homeDir, ".undoable");
    await fs.mkdir(undoableDir, { recursive: true });

    const legacyState = {
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "legacy-secret",
          models: [],
        },
      ],
      activeProvider: "openai",
      activeModel: "gpt-4.1-mini",
    };
    await fs.writeFile(path.join(undoableDir, "providers.json"), JSON.stringify(legacyState, null, 2), "utf-8");

    const { ProviderService } = await loadProviderServiceModule();
    const service = new ProviderService();
    await service.init("", "gpt-4.1-mini", "https://api.openai.com/v1");

    const active = service.getActiveConfig();
    expect(active.apiKey).toBe("legacy-secret");

    const rewritten = await fs.readFile(path.join(undoableDir, "providers.json"), "utf-8");
    expect(rewritten).not.toContain("legacy-secret");

    const parsed = JSON.parse(rewritten) as {
      providers: Array<{ id: string; apiKey?: string; apiKeyEncrypted?: string }>;
    };
    const openai = parsed.providers.find((p) => p.id === "openai");
    expect(openai?.apiKeyEncrypted).toBeTruthy();
    expect(openai?.apiKey).toBeUndefined();

    await service.destroy();
  });
});

async function loadProviderServiceModule() {
  vi.resetModules();

  const localDiscoveryModule = await import("./local-model-discovery.js");
  vi.spyOn(localDiscoveryModule.LocalModelDiscovery.prototype, "refresh").mockResolvedValue();
  vi.spyOn(localDiscoveryModule.LocalModelDiscovery.prototype, "startAutoRefresh").mockImplementation(() => {
    // no-op in tests
  });
  vi.spyOn(localDiscoveryModule.LocalModelDiscovery.prototype, "stopAutoRefresh").mockImplementation(() => {
    // no-op in tests
  });

  return import("./provider-service.js");
}
