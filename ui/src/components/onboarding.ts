import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

type OnboardingProfile = {
  userName: string;
  botName: string;
  timezone: string;
  personality: string;
  instructions: string;
  completed: boolean;
};

type ProviderInfo = {
  id: string;
  name: string;
  baseUrl: string;
  hasKey: boolean;
  modelCount: number;
  local?: boolean;
  available?: boolean;
};

type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  capabilities: { thinking: boolean; tagReasoning: boolean; vision: boolean; tools: boolean };
  contextWindow?: number;
};

type ChannelItem = {
  config: { channelId: string; enabled: boolean };
  status: { channelId: string; connected: boolean; error?: string };
  snapshot?: {
    configured: boolean;
    status: "connected" | "awaiting_scan" | "error" | "offline";
  };
};

type RunConfigLike = {
  mode?: "interactive" | "autonomous" | "supervised";
  economyMode?: boolean;
  allowIrreversibleActions?: boolean;
  spendGuard?: { dailyBudgetUsd?: number | null };
};

type RunPreset = "economy" | "balanced" | "power";

const STEP_LABELS = [
  "Profile",
  "Assistant",
  "Checks",
  "Review",
] as const;

const PRESET_INFO: Record<
  RunPreset,
  { title: string; summary: string; detail: string; mode: string }
> = {
  economy: {
    title: "Economy",
    summary: "Lowest cost, strict guardrails",
    detail: "Supervised mode, low iterations, undo strict, thinking off.",
    mode: "supervised",
  },
  balanced: {
    title: "Balanced",
    summary: "Reliable default for daily work",
    detail: "Supervised mode, medium iterations, undo strict, thinking medium.",
    mode: "supervised",
  },
  power: {
    title: "Power",
    summary: "Maximum autonomy and speed",
    detail: "Autonomous mode, high iterations, irreversible actions enabled.",
    mode: "autonomous",
  },
};

@customElement("undoable-onboarding")
export class UndoableOnboarding extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: color-mix(in srgb, var(--deep) 44%, transparent);
      backdrop-filter: blur(6px);
    }

    .card {
      width: min(940px, calc(100vw - 28px));
      max-height: calc(100vh - 28px);
      display: flex;
      flex-direction: column;
      background: var(--surface-1, #fff);
      border: 1px solid var(--border-strong, #dce6e3);
      border-radius: 18px;
      box-shadow: var(--shadow-raised, 0 18px 50px rgba(17, 26, 23, 0.08));
      overflow: hidden;
      animation: onboarding-pop 220ms ease;
    }

    @keyframes onboarding-pop {
      from {
        opacity: 0;
        transform: translateY(10px) scale(0.985);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .header {
      border-bottom: 1px solid var(--border-divider, #e5ebe9);
      padding: 16px 18px 14px 18px;
      background:
        radial-gradient(
          110% 160% at 100% -30%,
          color-mix(in srgb, var(--mint) 36%, white) 0%,
          transparent 56%
        ),
        var(--bg-deep, #f6faf8);
    }

    .header-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    .eyebrow {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.45px;
      text-transform: uppercase;
      color: var(--text-tertiary, #9aa29f);
      margin-bottom: 4px;
    }

    .title {
      font-family: var(--font-serif, Georgia, serif);
      color: var(--text-primary, #111a17);
      font-size: 30px;
      letter-spacing: -0.02em;
      line-height: 1;
      margin: 0 0 4px 0;
      font-weight: 400;
    }

    .subtitle {
      font-size: 13px;
      color: var(--text-secondary, #626e69);
      line-height: 1.45;
    }

    .close-btn {
      width: 30px;
      height: 30px;
      flex-shrink: 0;
      border-radius: 9px;
      border: 1px solid var(--border-strong, #dce6e3);
      background: var(--surface-1, #fff);
      color: var(--text-tertiary, #9aa29f);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
    }

    .close-btn:hover {
      background: var(--wash, #e6f0ec);
      color: var(--text-primary, #111a17);
    }

    .close-btn svg {
      width: 15px;
      height: 15px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    .steps {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }

    .step-chip {
      border: 1px solid var(--border-strong, #dce6e3);
      border-radius: 10px;
      padding: 8px 10px;
      background: var(--surface-1, #fff);
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .step-chip[data-active] {
      border-color: color-mix(in srgb, var(--mint-strong) 72%, white);
      background: color-mix(in srgb, var(--accent-subtle) 84%, white);
    }

    .step-chip[data-done] {
      border-color: color-mix(in srgb, var(--mint-strong) 70%, white);
      background: color-mix(in srgb, var(--mint) 20%, white);
    }

    .step-index {
      width: 20px;
      height: 20px;
      border-radius: 999px;
      border: 1px solid var(--border-strong, #dce6e3);
      font-size: 10px;
      font-weight: 700;
      color: var(--text-secondary, #626e69);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: var(--surface-1, #fff);
    }

    .step-chip[data-active] .step-index,
    .step-chip[data-done] .step-index {
      border-color: var(--mint-strong, #abccba);
      color: var(--dark, #2e4539);
      background: color-mix(in srgb, var(--mint) 26%, white);
    }

    .step-label {
      font-size: 11px;
      color: var(--text-secondary, #626e69);
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .body {
      padding: 18px;
      overflow-y: auto;
      min-height: 380px;
    }

    .step-title {
      font-size: 18px;
      color: var(--text-primary, #111a17);
      font-weight: 600;
      margin: 0 0 6px 0;
      letter-spacing: -0.01em;
    }

    .step-desc {
      font-size: 13px;
      color: var(--text-secondary, #626e69);
      line-height: 1.5;
      margin: 0 0 16px 0;
      max-width: 760px;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .field {
      margin-bottom: 12px;
    }

    .field label {
      display: block;
      margin-bottom: 6px;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-secondary, #626e69);
      letter-spacing: 0.34px;
      text-transform: uppercase;
    }

    .field-hint {
      margin-top: 6px;
      font-size: 11px;
      color: var(--text-tertiary, #9aa29f);
      line-height: 1.35;
    }

    .field input,
    .field select,
    .field textarea {
      width: 100%;
      box-sizing: border-box;
      border-radius: 10px;
      border: 1px solid var(--border-strong, #dce6e3);
      background: var(--surface-1, #fff);
      color: var(--text-primary, #111a17);
      padding: 9px 11px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
    }

    .field textarea {
      min-height: 104px;
      resize: vertical;
      line-height: 1.42;
    }

    .field input:focus,
    .field select:focus,
    .field textarea:focus {
      border-color: var(--mint-strong, #abccba);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mint) 24%, white);
    }

    .tz-search {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      border-bottom-color: transparent;
    }

    .tz-list {
      border: 1px solid var(--border-strong, #dce6e3);
      border-radius: 0 0 10px 10px;
      max-height: 210px;
      overflow-y: auto;
      background: var(--surface-1, #fff);
    }

    .tz-option {
      padding: 8px 11px;
      font-size: 12px;
      color: var(--text-secondary, #626e69);
      cursor: pointer;
    }

    .tz-option:hover {
      background: var(--wash, #e6f0ec);
      color: var(--text-primary, #111a17);
    }

    .tz-option[data-selected] {
      background: color-mix(in srgb, var(--mint) 24%, white);
      color: var(--dark, #2e4539);
      font-weight: 600;
    }

    .helper-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      border: 1px solid var(--border-strong, #dce6e3);
      background: var(--surface-1, #fff);
      color: var(--text-secondary, #626e69);
      font-size: 11px;
      font-weight: 600;
      padding: 5px 10px;
    }

    .helper-chip strong {
      color: var(--text-primary, #111a17);
      font-family: var(--mono, ui-monospace, Menlo, monospace);
      font-size: 10px;
    }

    .preset-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }

    .preset {
      border: 1px solid var(--border-strong, #dce6e3);
      border-radius: 12px;
      background: var(--surface-1, #fff);
      padding: 10px;
      text-align: left;
      cursor: pointer;
      min-height: 112px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .preset:hover {
      background: var(--wash, #e6f0ec);
    }

    .preset[data-active] {
      border-color: var(--mint-strong, #abccba);
      background: color-mix(in srgb, var(--mint) 20%, white);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mint-strong) 68%, white);
    }

    .preset-title {
      font-size: 13px;
      color: var(--text-primary, #111a17);
      font-weight: 700;
    }

    .preset-summary {
      font-size: 11px;
      color: var(--text-secondary, #626e69);
      font-weight: 600;
      line-height: 1.3;
    }

    .preset-detail {
      margin-top: auto;
      font-size: 10px;
      color: var(--text-tertiary, #9aa29f);
      line-height: 1.3;
    }

    .checks-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 10px;
    }

    .check-card {
      border: 1px solid var(--border-strong, #dce6e3);
      border-radius: 11px;
      background: var(--surface-1, #fff);
      padding: 10px;
    }

    .check-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 5px;
    }

    .check-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      flex-shrink: 0;
      background: var(--text-tertiary, #9aa29f);
    }

    .check-dot.ok {
      background: var(--success, #2e7d56);
    }

    .check-dot.warn {
      background: var(--warning, #b8860b);
    }

    .check-title {
      font-size: 12px;
      color: var(--text-primary, #111a17);
      font-weight: 700;
    }

    .check-copy {
      font-size: 11px;
      line-height: 1.35;
      color: var(--text-secondary, #626e69);
    }

    .channels-list {
      border: 1px solid var(--border-strong, #dce6e3);
      border-radius: 11px;
      background: var(--surface-1, #fff);
      overflow: hidden;
    }

    .channels-head,
    .channel-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
    }

    .channels-head {
      background: var(--bg-deep, #f6faf8);
      border-bottom: 1px solid var(--border-divider, #e5ebe9);
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.34px;
      color: var(--text-tertiary, #9aa29f);
    }

    .channel-row {
      border-bottom: 1px solid var(--border-divider, #e5ebe9);
      font-size: 12px;
      color: var(--text-secondary, #626e69);
    }

    .channel-row:last-child {
      border-bottom: none;
    }

    .channel-name {
      font-weight: 600;
      color: var(--text-primary, #111a17);
      text-transform: capitalize;
    }

    .channel-badge {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      border-radius: 999px;
      padding: 3px 7px;
      border: 1px solid var(--border-strong, #dce6e3);
      color: var(--text-secondary, #626e69);
      background: var(--surface-1, #fff);
    }

    .channel-badge.ok {
      background: color-mix(in srgb, var(--mint) 20%, white);
      border-color: color-mix(in srgb, var(--mint-strong) 70%, white);
      color: var(--dark, #2e4539);
    }

    .channel-badge.warn {
      background: var(--warning-subtle, rgba(184, 134, 11, 0.08));
      border-color: color-mix(in srgb, var(--warning) 40%, transparent);
      color: var(--warning, #b8860b);
    }

    .summary {
      border: 1px solid var(--border-strong, #dce6e3);
      border-radius: 12px;
      background: var(--surface-1, #fff);
      overflow: hidden;
      margin-bottom: 10px;
    }

    .summary-row {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 12px;
      padding: 9px 11px;
      border-bottom: 1px solid var(--border-divider, #e5ebe9);
      align-items: start;
    }

    .summary-row:last-child {
      border-bottom: none;
    }

    .summary-key {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-tertiary, #9aa29f);
      text-transform: uppercase;
      letter-spacing: 0.28px;
    }

    .summary-value {
      font-size: 12px;
      color: var(--text-secondary, #626e69);
      line-height: 1.4;
      word-break: break-word;
    }

    .summary-value strong {
      color: var(--text-primary, #111a17);
      font-weight: 700;
    }

    .checks-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 10px;
    }

    .actions {
      border-top: 1px solid var(--border-divider, #e5ebe9);
      padding: 12px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      background: var(--bg-deep, #f6faf8);
    }

    .actions-right {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .btn {
      height: 34px;
      border-radius: 9px;
      border: 1px solid var(--border-strong, #dce6e3);
      background: var(--surface-1, #fff);
      color: var(--text-secondary, #626e69);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.2px;
      padding: 0 12px;
      cursor: pointer;
      font-family: inherit;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .btn:hover {
      background: var(--wash, #e6f0ec);
      color: var(--text-primary, #111a17);
    }

    .btn-primary {
      border-color: var(--mint-strong, #abccba);
      background: color-mix(in srgb, var(--mint) 26%, white);
      color: var(--dark, #2e4539);
    }

    .btn-primary:hover {
      background: color-mix(in srgb, var(--mint) 34%, white);
      color: var(--dark, #2e4539);
    }

    .btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .save-error {
      margin-top: 10px;
      border: 1px solid color-mix(in srgb, var(--danger) 38%, transparent);
      background: var(--danger-subtle, rgba(192, 57, 43, 0.08));
      border-radius: 10px;
      padding: 8px 10px;
      color: var(--danger, #c0392b);
      font-size: 11px;
      line-height: 1.45;
    }

    .loading {
      min-height: 280px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary, #626e69);
      font-size: 13px;
      font-weight: 600;
    }

    @media (max-width: 880px) {
      .preset-grid {
        grid-template-columns: 1fr;
      }
      .grid-2,
      .checks-grid {
        grid-template-columns: 1fr;
      }
      .summary-row {
        grid-template-columns: 1fr;
        gap: 4px;
      }
    }

    @media (max-width: 680px) {
      :host {
        padding: 10px;
      }
      .card {
        width: 100%;
        max-height: calc(100vh - 12px);
      }
      .steps {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .body {
        padding: 14px;
      }
      .actions {
        padding: 10px 14px;
        flex-wrap: wrap;
      }
      .actions-right {
        margin-left: auto;
      }
      .title {
        font-size: 25px;
      }
    }
  `;

  @state() private step = 0;
  @state() private userName = "";
  @state() private botName = "Undoable";
  @state() private timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  @state() private personality = "";
  @state() private instructions = "";
  @state() private preset: RunPreset = "balanced";
  @state() private dailyBudgetDraft = "";
  @state() private activeProvider = "";
  @state() private activeModel = "";
  @state() private providerApiKeyDraft = "";
  @state() private providerBaseUrlDraft = "";
  @state() private providerBaseUrlTouched = false;
  @state() private providers: ProviderInfo[] = [];
  @state() private models: ModelInfo[] = [];
  @state() private channels: ChannelItem[] = [];
  @state() private daemonHealthy = false;
  @state() private undoStrictMode = true;
  @state() private lastCheckAt = "";
  @state() private loadingContext = false;
  @state() private saving = false;
  @state() private loaded = false;
  @state() private tzFilter = "";
  @state() private saveError = "";

  private allTimezones: string[] = (() => {
    try {
      const zones = Intl.supportedValuesOf("timeZone");
      return zones.length > 0
        ? zones
        : [Intl.DateTimeFormat().resolvedOptions().timeZone];
    } catch {
      return [Intl.DateTimeFormat().resolvedOptions().timeZone];
    }
  })();

  private readonly totalSteps = STEP_LABELS.length;

  connectedCallback() {
    super.connectedCallback();
    void this.bootstrap();
  }

  private authHeaders(json = false): HeadersInit {
    const token = localStorage.getItem("undoable_token");
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async fetchJson<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(this.authHeaders(Boolean(init.body)));
    if (init.headers) {
      const incoming = new Headers(init.headers);
      incoming.forEach((value, key) => headers.set(key, value));
    }
    const res = await fetch(path, {
      ...init,
      headers,
    });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        // best effort
      }
      throw new Error(message);
    }
    return (await res.json()) as T;
  }

  private async bootstrap() {
    await Promise.all([this.loadProfile(), this.loadSetupContext()]);
    this.loaded = true;
  }

  private inferPreset(config: RunConfigLike): RunPreset {
    if (config.economyMode) return "economy";
    if (config.allowIrreversibleActions || config.mode === "autonomous") {
      return "power";
    }
    return "balanced";
  }

  private modelsForProvider(providerId: string): ModelInfo[] {
    return this.models.filter((m) => m.provider === providerId);
  }

  private selectedProviderInfo(): ProviderInfo | null {
    return this.providers.find((provider) => provider.id === this.activeProvider)
      ?? null;
  }

  private providerIsReady(provider: ProviderInfo | null): boolean {
    if (!provider) return false;
    if (provider.local) return provider.available !== false;
    if (provider.hasKey) return true;
    return provider.id === this.activeProvider
      && this.providerApiKeyDraft.trim().length > 0;
  }

  private resetProviderDraft(providerId: string) {
    const provider = this.providers.find((entry) => entry.id === providerId);
    this.providerApiKeyDraft = "";
    this.providerBaseUrlDraft = provider?.baseUrl ?? "";
    this.providerBaseUrlTouched = false;
  }

  private pickDefaultProviderAndModel() {
    const providerPool =
      this.providers.filter((p) => p.hasKey || p.local) ?? [];
    const providerChoice = this.activeProvider
      ? this.activeProvider
      : providerPool[0]?.id ?? this.providers[0]?.id ?? this.models[0]?.provider ?? "";
    if (!providerChoice) return;
    const providerChanged = this.activeProvider !== providerChoice;
    this.activeProvider = providerChoice;
    if (providerChanged) {
      this.resetProviderDraft(providerChoice);
    } else if (!this.providerBaseUrlTouched && !this.providerBaseUrlDraft) {
      const provider = this.providers.find((entry) => entry.id === providerChoice);
      this.providerBaseUrlDraft = provider?.baseUrl ?? "";
    }

    const providerModels = this.modelsForProvider(providerChoice);
    if (
      !this.activeModel ||
      !providerModels.some((m) => m.id === this.activeModel)
    ) {
      this.activeModel = providerModels[0]?.id ?? "";
    }
  }

  private async loadProfile() {
    try {
      const p = await this.fetchJson<OnboardingProfile>("/api/chat/onboarding");
      this.userName = p.userName || "";
      this.botName = p.botName || "Undoable";
      this.timezone = p.timezone || this.timezone;
      this.personality = p.personality || "";
      this.instructions = p.instructions || "";
    } catch {
      // best effort
    }
  }

  private async loadSetupContext() {
    this.loadingContext = true;
    try {
      const settled = await Promise.allSettled([
        this.fetchJson<{ status: string }>("/api/health"),
        this.fetchJson<{ provider: string; model: string }>("/api/chat/model"),
        this.fetchJson<{ models: ModelInfo[] }>("/api/chat/models"),
        this.fetchJson<{ providers: ProviderInfo[] }>("/api/chat/providers"),
        this.fetchJson<ChannelItem[]>("/api/channels"),
        this.fetchJson<RunConfigLike>("/api/chat/run-config"),
      ]);

      const health = settled[0];
      if (health.status === "fulfilled") {
        this.daemonHealthy = health.value.status === "ok";
      }

      const activeModel = settled[1];
      if (activeModel.status === "fulfilled") {
        this.activeProvider = activeModel.value.provider ?? this.activeProvider;
        this.activeModel = activeModel.value.model ?? this.activeModel;
      }

      const models = settled[2];
      if (models.status === "fulfilled") {
        this.models = models.value.models ?? [];
      }

      const providers = settled[3];
      if (providers.status === "fulfilled") {
        this.providers = providers.value.providers ?? [];
      }

      const channels = settled[4];
      if (channels.status === "fulfilled") {
        this.channels = channels.value ?? [];
      }

      const runConfig = settled[5];
      if (runConfig.status === "fulfilled") {
        this.preset = this.inferPreset(runConfig.value);
        this.undoStrictMode = !runConfig.value.allowIrreversibleActions;
        if (
          typeof runConfig.value.spendGuard?.dailyBudgetUsd === "number" &&
          Number.isFinite(runConfig.value.spendGuard.dailyBudgetUsd) &&
          runConfig.value.spendGuard.dailyBudgetUsd > 0
        ) {
          this.dailyBudgetDraft = String(runConfig.value.spendGuard.dailyBudgetUsd);
        }
      }

      this.pickDefaultProviderAndModel();
      this.lastCheckAt = new Date().toISOString();
    } finally {
      this.loadingContext = false;
    }
  }

  private async applyRuntimeDefaults() {
    const runPatch: {
      mode: "interactive" | "autonomous" | "supervised";
      maxIterations: number;
      economyMode: boolean;
      allowIrreversibleActions: boolean;
      dailyBudgetUsd?: number | null;
    } =
      this.preset === "economy"
        ? {
            mode: "supervised",
            maxIterations: 6,
            economyMode: true,
            allowIrreversibleActions: false,
          }
        : this.preset === "power"
          ? {
              mode: "autonomous",
              maxIterations: 30,
              economyMode: false,
              allowIrreversibleActions: true,
            }
          : {
              mode: "supervised",
              maxIterations: 12,
              economyMode: false,
              allowIrreversibleActions: false,
            };

    const budgetRaw = this.dailyBudgetDraft.trim();
    if (budgetRaw.length > 0) {
      const parsed = Number(budgetRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Daily budget must be a positive number.");
      }
      runPatch.dailyBudgetUsd = parsed;
    }

    await this.fetchJson("/api/chat/run-config", {
      method: "POST",
      body: JSON.stringify(runPatch),
    });

    await this.fetchJson("/api/chat/approval-mode", {
      method: "POST",
      body: JSON.stringify({
        mode: "off",
      }),
    });

    await this.fetchJson("/api/chat/thinking", {
      method: "POST",
      body: JSON.stringify(
        this.preset === "economy"
          ? { level: "off", visibility: "off" }
          : this.preset === "power"
            ? { level: "high", visibility: "stream" }
            : { level: "medium", visibility: "stream" },
      ),
    });

    const selectedProvider = this.selectedProviderInfo();
    if (!selectedProvider || !this.activeProvider) {
      throw new Error("Select a provider before finishing onboarding.");
    }
    if (!this.activeModel) {
      throw new Error("Select a model before finishing onboarding.");
    }

    const providerApiKey = this.providerApiKeyDraft.trim();
    if (!selectedProvider.local && providerApiKey.length > 0) {
      const providerBaseUrl = this.providerBaseUrlDraft.trim();
      await this.fetchJson("/api/chat/providers", {
        method: "POST",
        body: JSON.stringify({
          provider: this.activeProvider,
          apiKey: providerApiKey,
          ...(providerBaseUrl ? { baseUrl: providerBaseUrl } : {}),
        }),
      });

      this.providers = this.providers.map((entry) =>
        entry.id === this.activeProvider
          ? {
              ...entry,
              hasKey: true,
              baseUrl: providerBaseUrl || entry.baseUrl,
            }
          : entry,
      );
    }

    if (!this.providerIsReady(selectedProvider)) {
      throw new Error(
        `Set an API key for ${selectedProvider.name} or choose a ready local provider.`,
      );
    }

    if (this.activeProvider && this.activeModel) {
      await this.fetchJson("/api/chat/model", {
        method: "POST",
        body: JSON.stringify({
          provider: this.activeProvider,
          model: this.activeModel,
        }),
      });
    }
  }

  private async saveProfile() {
    this.saving = true;
    this.saveError = "";
    try {
      await this.fetchJson("/api/chat/onboarding", {
        method: "POST",
        body: JSON.stringify({
          userName: this.userName,
          botName: this.botName,
          timezone: this.timezone,
          personality: this.personality || undefined,
          instructions: this.instructions || undefined,
        }),
      });

      await this.applyRuntimeDefaults();

      this.dispatchEvent(
        new CustomEvent("onboarding-complete", {
          bubbles: true,
          composed: true,
        }),
      );
    } catch (e) {
      this.saveError = `Could not finish setup. ${(e as Error).message}`;
    } finally {
      this.saving = false;
    }
  }

  private async close() {
    if (this.saving) return;
    this.saving = true;
    try {
      await this.fetchJson("/api/chat/onboarding", {
        method: "POST",
        body: JSON.stringify({
          userName: this.userName || "User",
          botName: this.botName || "Undoable",
          timezone: this.timezone,
          personality: this.personality || undefined,
          instructions: this.instructions || undefined,
        }),
      });
    } catch {
      // best effort
    } finally {
      this.saving = false;
      this.dispatchEvent(
        new CustomEvent("onboarding-close", {
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private openSettingsConsole() {
    this.dispatchEvent(
      new CustomEvent("onboarding-close", {
        bubbles: true,
        composed: true,
      }),
    );
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: "settings",
        bubbles: true,
        composed: true,
      }),
    );
  }

  private canProceedFromStep(): boolean {
    if (this.step === 0) return this.timezone.trim().length > 0;
    if (this.step === 1) {
      if (this.botName.trim().length === 0) return false;
      if (!this.activeProvider || !this.activeModel) return false;
      return this.providerIsReady(this.selectedProviderInfo());
    }
    return true;
  }

  private next() {
    if (!this.canProceedFromStep()) return;
    if (this.step < this.totalSteps - 1) {
      this.step += 1;
      return;
    }
    void this.saveProfile();
  }

  private back() {
    if (this.step > 0) this.step -= 1;
  }

  private filteredTimezones(): string[] {
    const query = this.tzFilter.trim().toLowerCase();
    const pool = query
      ? this.allTimezones.filter((tz) => tz.toLowerCase().includes(query))
      : this.allTimezones;
    const unique = query ? pool : [this.timezone, ...pool];
    const deduped = Array.from(new Set(unique.filter(Boolean)));
    return deduped.slice(0, 120);
  }

  private localTimePreview(tz: string): string {
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: tz,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "2-digit",
      }).format(new Date());
    } catch {
      return "Unavailable";
    }
  }

  private renderStepChips() {
    return html`
      <div class="steps">
        ${STEP_LABELS.map((label, index) => html`
          <div
            class="step-chip"
            ?data-active=${index === this.step}
            ?data-done=${index < this.step}
          >
            <span class="step-index">${index + 1}</span>
            <span class="step-label">${label}</span>
          </div>
        `)}
      </div>
    `;
  }

  private renderStepProfile() {
    return html`
      <h2 class="step-title">Profile and local context</h2>
      <p class="step-desc">
        Define how the assistant identifies you and which timezone it should
        use for schedules, reminders, and timestamp-aware tasks.
      </p>

      <div class="grid-2">
        <div class="field">
          <label>Your name</label>
          <input
            type="text"
            placeholder="How should the assistant address you?"
            .value=${this.userName}
            @input=${(e: Event) => {
              this.userName = (e.target as HTMLInputElement).value;
            }}
          />
          <div class="field-hint">
            Used in USER.md and personalization prompts.
          </div>
        </div>

        <div class="field">
          <label>Detected local time</label>
          <div class="helper-chip">
            Timezone
            <strong>${this.timezone}</strong>
          </div>
          <div class="field-hint">
            ${this.localTimePreview(this.timezone)}
          </div>
        </div>
      </div>

      <div class="field">
        <label>Timezone</label>
        <input
          class="tz-search"
          type="text"
          placeholder="Search timezone (America/New_York, Europe/London, etc.)"
          .value=${this.tzFilter}
          @input=${(e: Event) => {
            this.tzFilter = (e.target as HTMLInputElement).value;
          }}
        />
        <div class="tz-list">
          ${this.filteredTimezones().length === 0
            ? html`<div class="tz-option">No timezones match this search.</div>`
            : this.filteredTimezones().map((tz) => html`
                <div
                  class="tz-option"
                  ?data-selected=${tz === this.timezone}
                  @click=${() => {
                    this.timezone = tz;
                    this.tzFilter = "";
                  }}
                >
                  ${tz}
                </div>
              `)}
        </div>
      </div>
    `;
  }

  private renderStepAssistant() {
    const modelsForProvider = this.modelsForProvider(this.activeProvider);
    const hasProviderOptions = this.providers.length > 0;
    const selectedProvider = this.selectedProviderInfo();
    const providerRequiresApiKey = Boolean(
      selectedProvider && !selectedProvider.local,
    );
    const selectedProviderReady = this.providerIsReady(selectedProvider);
    return html`
      <h2 class="step-title">Assistant identity and defaults</h2>
      <p class="step-desc">
        Choose assistant behavior, cost profile, and active model. You can
        change everything later from the full Settings console.
      </p>

      <div class="field">
        <label>Assistant name</label>
        <input
          type="text"
          placeholder="e.g. Undoable, Atlas, Nova"
          .value=${this.botName}
          @input=${(e: Event) => {
            this.botName = (e.target as HTMLInputElement).value;
          }}
        />
      </div>

      <div class="field">
        <label>Runtime preset</label>
        <div class="preset-grid">
          ${(Object.keys(PRESET_INFO) as RunPreset[]).map((id) => {
            const info = PRESET_INFO[id];
            return html`
              <button
                class="preset"
                ?data-active=${this.preset === id}
                @click=${() => {
                  this.preset = id;
                }}
              >
                <div class="preset-title">${info.title}</div>
                <div class="preset-summary">${info.summary}</div>
                <div class="preset-detail">${info.detail}</div>
              </button>
            `;
          })}
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label>Provider</label>
          <select
            .value=${this.activeProvider}
            @change=${(e: Event) => {
              const nextProvider = (e.target as HTMLSelectElement).value;
              this.activeProvider = nextProvider;
              this.resetProviderDraft(nextProvider);
              const pool = this.modelsForProvider(this.activeProvider);
              this.activeModel = pool[0]?.id ?? "";
            }}
          >
            ${!hasProviderOptions
              ? html`<option value="">No providers available</option>`
              : this.providers.map((provider) => html`
                  <option value=${provider.id}>
                    ${provider.name}
                    ${provider.hasKey || provider.local ? "" : " (no key)"}
                  </option>
                `)}
          </select>
          <div class="field-hint">
            Providers with API keys (or local providers) are ready immediately.
          </div>
        </div>

        <div class="field">
          <label>Model</label>
          <select
            .value=${this.activeModel}
            @change=${(e: Event) => {
              this.activeModel = (e.target as HTMLSelectElement).value;
            }}
          >
            ${modelsForProvider.length === 0
              ? html`<option value="">No models available</option>`
              : modelsForProvider.map((model) => html`
                  <option value=${model.id}>${model.name}</option>
                `)}
          </select>
          <div class="field-hint">
            Active model used for chat when setup finishes.
          </div>
        </div>
      </div>

      ${providerRequiresApiKey
        ? html`
            <div class="grid-2">
              <div class="field">
                <label>${selectedProvider?.name || "Provider"} API key</label>
                <input
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder=${selectedProvider?.hasKey
                    ? "Already configured. Enter a new key to rotate."
                    : "Paste API key to continue"}
                  .value=${this.providerApiKeyDraft}
                  @input=${(e: Event) => {
                    this.providerApiKeyDraft = (e.target as HTMLInputElement).value;
                  }}
                />
                <div class="field-hint">
                  ${selectedProviderReady
                    ? selectedProvider?.hasKey && this.providerApiKeyDraft.trim().length === 0
                      ? "Key already configured. Enter a value only to replace it."
                      : "Key will be saved when onboarding completes."
                    : "Required: add an API key for the selected provider."}
                </div>
              </div>

              <div class="field">
                <label>Base URL (optional)</label>
                <input
                  type="url"
                  placeholder=${selectedProvider?.baseUrl || "https://api.openai.com/v1"}
                  .value=${this.providerBaseUrlDraft}
                  @input=${(e: Event) => {
                    this.providerBaseUrlDraft = (e.target as HTMLInputElement).value;
                    this.providerBaseUrlTouched = true;
                  }}
                />
                <div class="field-hint">
                  Override only for compatible OpenAI-style gateways/proxies.
                </div>
              </div>
            </div>
          `
        : selectedProvider?.local
          ? html`
              <div class="field-hint">
                Local provider selected. API key is not required.
              </div>
            `
          : nothing}

      <div class="field">
        <label>Optional daily budget (USD)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Leave empty to keep current budget policy"
          .value=${this.dailyBudgetDraft}
          @input=${(e: Event) => {
            this.dailyBudgetDraft = (e.target as HTMLInputElement).value;
          }}
        />
      </div>

      <div class="grid-2">
        <div class="field">
          <label>Personality (SOUL.md)</label>
          <textarea
            placeholder="Describe tone and behavior."
            .value=${this.personality}
            @input=${(e: Event) => {
              this.personality = (e.target as HTMLTextAreaElement).value;
            }}
          ></textarea>
        </div>

        <div class="field">
          <label>Permanent instructions (IDENTITY.md)</label>
          <textarea
            placeholder="Rules and preferences that should always apply."
            .value=${this.instructions}
            @input=${(e: Event) => {
              this.instructions = (e.target as HTMLTextAreaElement).value;
            }}
          ></textarea>
        </div>
      </div>
    `;
  }

  private renderStepChecks() {
    const selectedProvider = this.selectedProviderInfo();
    const selectedProviderReady = this.providerIsReady(selectedProvider);
    const providersReady = this.providers.filter((provider) =>
      this.providerIsReady(provider)).length;
    const totalProviders = this.providers.length;
    const enabledChannels = this.channels.filter((c) => c.config.enabled).length;
    const connectedChannels = this.channels.filter((c) => c.status.connected)
      .length;
    const modelReady = Boolean(this.activeProvider && this.activeModel);
    const checks = [
      {
        title: "Daemon API",
        ok: this.daemonHealthy,
        copy: this.daemonHealthy
          ? "Daemon responded to /health."
          : "Cannot confirm daemon health right now.",
      },
      {
        title: "Providers",
        ok: providersReady > 0,
        copy: selectedProvider
          ? `${providersReady}/${totalProviders} provider(s) ready. Selected ${selectedProvider.name}: ${selectedProviderReady ? "ready" : "needs API key"}.`
          : `${providersReady}/${totalProviders} provider(s) ready with key or local access.`,
      },
      {
        title: "Active model",
        ok: modelReady && selectedProviderReady,
        copy: modelReady
          ? selectedProviderReady
            ? `${this.activeProvider}/${this.activeModel}`
            : `${this.activeProvider}/${this.activeModel} selected, but provider access is not ready yet.`
          : "No active model selected yet.",
      },
      {
        title: "Undo guarantee",
        ok: this.undoStrictMode,
        copy: this.undoStrictMode
          ? "Strict undo mode is active."
          : "Open mode allows irreversible actions.",
      },
      {
        title: "Channels enabled",
        ok: enabledChannels > 0,
        copy: `${enabledChannels} enabled, ${connectedChannels} connected.`,
      },
      {
        title: "Runtime preset",
        ok: true,
        copy: `${PRESET_INFO[this.preset].title} (${PRESET_INFO[this.preset].mode})`,
      },
    ];

    return html`
      <h2 class="step-title">Environment checks and recoverability</h2>
      <p class="step-desc">
        Validate core surfaces before first use. This helps users understand
        what is already configured and what still needs setup.
      </p>

      <div class="checks-grid">
        ${checks.map((item) => html`
          <div class="check-card">
            <div class="check-row">
              <span class="check-dot ${item.ok ? "ok" : "warn"}"></span>
              <div class="check-title">${item.title}</div>
            </div>
            <div class="check-copy">${item.copy}</div>
          </div>
        `)}
      </div>

      <div class="channels-list">
        <div class="channels-head">
          <span>Channel</span>
          <span>Configured</span>
          <span>Live</span>
        </div>
        ${this.channels.length === 0
          ? html`
              <div class="channel-row">
                <span class="channel-name">No channels detected</span>
                <span class="channel-badge warn">none</span>
                <span class="channel-badge">idle</span>
              </div>
            `
          : this.channels.map((channel) => html`
              <div class="channel-row">
                <span class="channel-name">${channel.config.channelId}</span>
                <span class="channel-badge ${channel.config.enabled ? "ok" : "warn"}">
                  ${channel.config.enabled ? "enabled" : "disabled"}
                </span>
                <span class="channel-badge ${channel.status.connected ? "ok" : ""}">
                  ${channel.status.connected ? "connected" : "offline"}
                </span>
              </div>
            `)}
      </div>

      <div class="checks-actions">
        <div class="field-hint">
          Last check: ${this.lastCheckAt
            ? new Date(this.lastCheckAt).toLocaleTimeString()
            : "not yet"}
        </div>
        <div class="actions-right">
          <button
            class="btn"
            ?disabled=${this.loadingContext}
            @click=${() => {
              void this.loadSetupContext();
            }}
          >
            ${this.loadingContext ? "Refreshing..." : "Refresh checks"}
          </button>
          <button class="btn" @click=${this.openSettingsConsole}>
            Open Settings
          </button>
        </div>
      </div>
    `;
  }

  private renderStepReview() {
    const selectedProvider = this.selectedProviderInfo();
    const selectedProviderReady = this.providerIsReady(selectedProvider);
    const providersReady = this.providers.filter((provider) =>
      this.providerIsReady(provider)).length;
    const enabledChannels = this.channels.filter((c) => c.config.enabled).length;
    const connectedChannels = this.channels.filter((c) => c.status.connected)
      .length;

    return html`
      <h2 class="step-title">Final review</h2>
      <p class="step-desc">
        This applies your profile and runtime defaults now. You can reopen this
        at any time from the profile button in the header.
      </p>

      <div class="summary">
        <div class="summary-row">
          <div class="summary-key">User profile</div>
          <div class="summary-value">
            <strong>${this.userName || "User"}</strong> in
            <strong>${this.timezone}</strong>
          </div>
        </div>
        <div class="summary-row">
          <div class="summary-key">Assistant</div>
          <div class="summary-value">
            <strong>${this.botName || "Undoable"}</strong> with
            <strong>${PRESET_INFO[this.preset].title}</strong> runtime preset
          </div>
        </div>
        <div class="summary-row">
          <div class="summary-key">Model route</div>
          <div class="summary-value">
            ${this.activeProvider && this.activeModel
              ? html`<strong>${this.activeProvider}/${this.activeModel}</strong>`
              : "No model selected (can be configured later)."}
          </div>
        </div>
        <div class="summary-row">
          <div class="summary-key">Provider access</div>
          <div class="summary-value">
            ${selectedProvider
              ? html`
                  <strong>${selectedProvider.name}</strong>:
                  <strong>${selectedProviderReady ? "ready" : "needs API key"}</strong>
                `
              : "No provider selected."}
          </div>
        </div>
        <div class="summary-row">
          <div class="summary-key">Current readiness</div>
          <div class="summary-value">
            Providers ready: <strong>${providersReady}</strong>,
            Channels enabled: <strong>${enabledChannels}</strong>,
            Channels connected: <strong>${connectedChannels}</strong>,
            Undo mode:
            <strong>${this.undoStrictMode ? "strict" : "open"}</strong>
          </div>
        </div>
        <div class="summary-row">
          <div class="summary-key">Files updated</div>
          <div class="summary-value">
            <strong>~/.undoable/USER.md</strong>,
            <strong>~/.undoable/SOUL.md</strong>,
            <strong>~/.undoable/IDENTITY.md</strong>
          </div>
        </div>
      </div>

      <div class="field-hint">
        Tip: after setup, test with "Create a file on desktop and then undo it"
        to validate the undo workflow end-to-end.
      </div>
    `;
  }

  private renderCurrentStep() {
    if (this.step === 0) return this.renderStepProfile();
    if (this.step === 1) return this.renderStepAssistant();
    if (this.step === 2) return this.renderStepChecks();
    return this.renderStepReview();
  }

  render() {
    if (!this.loaded) {
      return html`
        <div class="card">
          <div class="loading">Preparing onboarding...</div>
        </div>
      `;
    }

    const nextLabel =
      this.step === this.totalSteps - 1
        ? this.saving
          ? "Saving..."
          : "Save and start"
        : "Continue";

    return html`
      <div class="card">
        <div class="header">
          <div class="header-top">
            <div>
              <div class="eyebrow">Undoable Setup</div>
              <h1 class="title">First-run onboarding</h1>
              <p class="subtitle">
                Configure identity, runtime defaults, and safety checks before
                starting daily usage.
              </p>
            </div>
            <button
              class="close-btn"
              @click=${this.close}
              title="Skip for now"
              ?disabled=${this.saving}
            >
              <svg viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          ${this.renderStepChips()}
        </div>

        <div class="body">
          ${this.renderCurrentStep()}
          ${this.saveError
            ? html`<div class="save-error">${this.saveError}</div>`
            : nothing}
        </div>

        <div class="actions">
          <button
            class="btn"
            @click=${this.close}
            ?disabled=${this.saving}
          >
            Skip for now
          </button>
          <div class="actions-right">
            ${this.step > 0
              ? html`
                  <button
                    class="btn"
                    @click=${this.back}
                    ?disabled=${this.saving}
                  >
                    Back
                  </button>
                `
              : nothing}
            <button
              class="btn btn-primary"
              @click=${this.next}
              ?disabled=${this.saving || !this.canProceedFromStep()}
            >
              ${nextLabel}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
