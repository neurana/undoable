import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api, type UndoListResult } from "../api/client.js";

type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  capabilities: { thinking: boolean; tagReasoning: boolean; vision: boolean; tools: boolean };
  contextWindow?: number;
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

type LocalServerInfo = {
  provider: string;
  available: boolean;
  modelCount: number;
  lastChecked?: number;
};

type TtsStatus = {
  enabled: boolean;
  provider: string;
  providers: string[];
};

type RunConfigSnapshot = {
  allowIrreversibleActions?: boolean;
  undoGuaranteeEnabled?: boolean;
};

@customElement("chat-settings")
export class ChatSettings extends LitElement {
  static styles = css`
    :host { display: block; }
    .overlay {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0,0,0,0.4); backdrop-filter: blur(2px);
      display: flex; align-items: center; justify-content: center;
    }
    .panel {
      background: var(--bg-base, #fff); border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 16px; width: 480px; max-width: 92vw; max-height: 80vh;
      overflow: hidden; display: flex; flex-direction: column;
      box-shadow: 0 24px 48px rgba(0,0,0,0.15);
    }
    .panel-header {
      padding: 14px 16px; display: flex; align-items: center; gap: 10px;
      border-bottom: 1px solid var(--border-divider, #e0e0e0);
    }
    .panel-title { font-size: 14px; font-weight: 600; color: var(--text-primary, #1a1a1a); flex: 1; }
    .btn-close {
      width: 28px; height: 28px; border-radius: 8px; border: none;
      background: transparent; color: var(--text-tertiary, #999);
      cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;
    }
    .btn-close:hover { background: var(--wash, #f0f0f0); }
    .tabs {
      display: flex; border-bottom: 1px solid var(--border-divider, #e0e0e0);
      padding: 0 16px;
    }
    .tab {
      padding: 8px 12px; font-size: 12px; font-weight: 500;
      color: var(--text-tertiary, #999); cursor: pointer;
      border-bottom: 2px solid transparent; background: none; border-top: none; border-left: none; border-right: none;
      font-family: inherit;
    }
    .tab:hover { color: var(--text-secondary, #666); }
    .tab[data-active] { color: var(--text-primary, #1a1a1a); border-bottom-color: var(--accent, #00D090); }
    .panel-body { flex: 1; overflow-y: auto; padding: 12px 16px; }

    /* Models */
    .provider-group { margin-bottom: 12px; }
    .provider-name {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      color: var(--text-tertiary, #999); letter-spacing: 0.8px;
      padding: 4px 0; margin-bottom: 4px;
    }
    .model-row {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 8px; border-radius: 8px; cursor: pointer;
      transition: background 120ms ease;
    }
    .model-row:hover { background: var(--wash, #f0f0f0); }
    .model-row[data-active] { background: var(--accent-subtle, #e6f9f1); }
    .model-name { font-size: 12px; font-weight: 500; color: var(--text-primary, #1a1a1a); flex: 1; }
    .model-caps { display: flex; gap: 4px; }
    .cap-badge {
      font-size: 9px; padding: 1px 5px; border-radius: 4px;
      background: var(--wash, #f0f0f0); color: var(--text-tertiary, #999);
      font-weight: 600;
    }
    .cap-badge.active { background: var(--accent-subtle, #e6f9f1); color: var(--accent, #00D090); }
    .model-row[data-disabled] { opacity: 0.4; cursor: not-allowed; }
    .no-key-hint { font-size: 10px; color: var(--text-tertiary, #999); font-style: italic; }
    .status-dot {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      margin-right: 4px; vertical-align: middle;
    }
    .status-dot.online { background: var(--accent, #00D090); }
    .status-dot.offline { background: var(--text-tertiary, #999); }
    .local-header {
      display: flex; align-items: center; justify-content: space-between;
    }
    .btn-refresh {
      padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border-strong, #ccc);
      background: transparent; color: var(--text-tertiary, #999);
      font-size: 9px; font-weight: 600; cursor: pointer; font-family: inherit;
      transition: all 120ms ease;
    }
    .btn-refresh:hover { background: var(--wash, #f0f0f0); color: var(--text-secondary, #666); }
    .btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }
    .server-status {
      font-size: 10px; color: var(--text-tertiary, #999); padding: 2px 0;
    }
    .no-models-hint {
      font-size: 11px; color: var(--text-tertiary, #999); font-style: italic; padding: 4px 8px;
    }

    /* Providers */
    .provider-row {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 0; border-bottom: 1px solid var(--border-divider, #e0e0e0);
    }
    .provider-row:last-child { border-bottom: none; }
    .provider-info { flex: 1; }
    .provider-label { font-size: 12px; font-weight: 600; color: var(--text-primary, #1a1a1a); }
    .provider-url { font-size: 10px; color: var(--text-tertiary, #999); }
    .key-status {
      font-size: 10px; padding: 2px 6px; border-radius: 4px;
      font-weight: 600;
    }
    .key-set { background: var(--accent-subtle, #e6f9f1); color: var(--accent, #00D090); }
    .key-missing { background: var(--wash, #f0f0f0); color: var(--text-tertiary, #999); }
    .btn-key {
      padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border-strong, #ccc);
      background: transparent; color: var(--text-secondary, #666);
      font-size: 10px; font-weight: 600; cursor: pointer; font-family: inherit;
    }
    .form-select,
    .form-input {
      min-width: 140px;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid var(--border-strong, #ccc);
      background: var(--surface-1, #fff);
      color: var(--text-primary, #1a1a1a);
      font-size: 11px;
      font-family: inherit;
    }
    .form-select:focus,
    .form-input:focus {
      outline: none;
      border-color: var(--accent, #00D090);
    }
    .btn-key:hover { background: var(--wash, #f0f0f0); }
    .btn-key.danger { color: var(--danger, #c0392b); border-color: var(--danger, #c0392b); }
    .btn-key.danger:hover { background: rgba(192,57,43,0.05); }

    /* Undo */
    .undo-kpis {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .undo-kpi {
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 10px;
      padding: 8px 10px;
      background: var(--surface-1, #fff);
    }
    .undo-kpi-label {
      font-size: 10px;
      color: var(--text-tertiary, #999);
      text-transform: uppercase;
      letter-spacing: 0.4px;
      font-weight: 700;
    }
    .undo-kpi-value {
      font-size: 16px;
      color: var(--text-primary, #1a1a1a);
      font-weight: 700;
      margin-top: 2px;
      font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    }
    .undo-mode-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 10px;
      padding: 10px 12px;
      background: var(--surface-1, #fff);
      margin-bottom: 12px;
    }
    .undo-mode-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary, #1a1a1a);
    }
    .undo-mode-sub {
      font-size: 10px;
      color: var(--text-tertiary, #999);
      margin-top: 2px;
    }
    .undo-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid transparent;
    }
    .undo-badge.strict {
      color: var(--accent, #00b377);
      background: var(--accent-subtle, #e6f9f1);
      border-color: rgba(0, 176, 120, 0.25);
    }
    .undo-badge.open {
      color: var(--danger, #c0392b);
      background: rgba(192, 57, 43, 0.08);
      border-color: rgba(192, 57, 43, 0.22);
    }
    .undo-list {
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 10px;
      overflow: hidden;
      background: var(--surface-1, #fff);
    }
    .undo-list-header {
      padding: 8px 10px;
      border-bottom: 1px solid var(--border-divider, #e0e0e0);
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--text-tertiary, #999);
      background: var(--wash, #f6f7f6);
    }
    .undo-list-empty {
      padding: 12px 10px;
      font-size: 11px;
      color: var(--text-tertiary, #999);
    }
    .undo-item {
      padding: 10px;
      border-bottom: 1px solid var(--border-divider, #e0e0e0);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .undo-item:last-child { border-bottom: none; }
    .undo-item-top {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: space-between;
    }
    .undo-item-tool {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary, #1a1a1a);
      font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    }
    .undo-item-meta {
      font-size: 10px;
      color: var(--text-tertiary, #999);
    }
    .undo-item-error {
      font-size: 11px;
      color: var(--danger, #c0392b);
      line-height: 1.4;
    }
  `;

  @property({ type: Boolean }) open = false;
  @property({ type: String }) currentModel = "";
  @property({ type: String }) currentProvider = "";

  @state() private tab: "models" | "providers" | "voice" | "browser" | "undo" = "models";
  @state() private models: ModelInfo[] = [];
  @state() private providers: ProviderInfo[] = [];
  @state() private localServers: LocalServerInfo[] = [];
  @state() private refreshingLocal = false;
  @state() private tts: TtsStatus = { enabled: false, provider: "system", providers: ["system"] };
  @state() private customVoiceProvider = "";
  @state() private browserHeadless = false;
  @state() private undoCoverage: UndoListResult = { undoable: [], redoable: [], recordedCount: 0, nonUndoableRecent: [] };
  @state() private undoLoading = false;
  @state() private allowIrreversibleActions = false;

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.loadData();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("open") && this.open) {
      void this.loadData();
    }
  }

  private async loadData() {
    try {
      const [
        modelsRes,
        providersRes,
        serversRes,
        ttsStatus,
        ttsProviders,
        browserStatus,
        undoList,
        runConfigRes,
      ] = await Promise.all([
        fetch("/api/chat/models"),
        fetch("/api/chat/providers"),
        fetch("/api/chat/local-servers").catch(() => null),
        api.gateway.tts.status().catch(() => null),
        api.gateway.tts.providers().catch(() => null),
        api.gateway.browser.isHeadless().catch(() => null),
        api.undo.list().catch(() => null),
        fetch("/api/chat/run-config").catch(() => null),
      ]);
      if (modelsRes.ok) {
        const data = await modelsRes.json() as { models: ModelInfo[] };
        this.models = data.models;
      }
      if (providersRes.ok) {
        const data = await providersRes.json() as { providers: ProviderInfo[] };
        this.providers = data.providers;
      }
      if (serversRes?.ok) {
        const data = await serversRes.json() as { servers: LocalServerInfo[] };
        this.localServers = data.servers;
      }
      if (ttsStatus) {
        this.tts = ttsStatus;
      }
      if (ttsProviders) {
        this.tts = {
          enabled: this.tts.enabled,
          provider: ttsProviders.active,
          providers: ttsProviders.providers,
        };
      }
      if (browserStatus !== null) {
        this.browserHeadless = browserStatus.headless ?? false;
      }
      if (undoList) {
        this.undoCoverage = {
          undoable: undoList.undoable ?? [],
          redoable: undoList.redoable ?? [],
          recordedCount: undoList.recordedCount ?? undoList.undoable.length + undoList.redoable.length,
          nonUndoableRecent: undoList.nonUndoableRecent ?? [],
        };
      }
      if (runConfigRes?.ok) {
        const rc = (await runConfigRes.json()) as RunConfigSnapshot;
        if (typeof rc.allowIrreversibleActions === "boolean") {
          this.allowIrreversibleActions = rc.allowIrreversibleActions;
        } else if (typeof rc.undoGuaranteeEnabled === "boolean") {
          this.allowIrreversibleActions = !rc.undoGuaranteeEnabled;
        }
      }
    } catch { /* ignore */ }
  }

  private async toggleVoiceEnabled(enabled: boolean) {
    try {
      const next = enabled
        ? await api.gateway.tts.enable()
        : await api.gateway.tts.disable();
      this.tts = {
        ...this.tts,
        enabled: next.enabled,
        provider: next.provider,
      };
    } catch { /* ignore */ }
  }

  private async selectVoiceProvider(provider: string) {
    if (!provider) return;
    try {
      const next = await api.gateway.tts.setProvider(provider);
      this.tts = {
        enabled: this.tts.enabled,
        provider: next.provider,
        providers: next.providers,
      };
      this.customVoiceProvider = "";
    } catch { /* ignore */ }
  }

  private async toggleBrowserHeadless(headless: boolean) {
    try {
      const result = await api.gateway.browser.setHeadless(headless);
      this.browserHeadless = result.headless ?? headless;
    } catch { /* ignore */ }
  }

  private async refreshUndoCoverage() {
    this.undoLoading = true;
    try {
      const [undoList, runConfigRes] = await Promise.all([
        api.undo.list(),
        fetch("/api/chat/run-config").catch(() => null),
      ]);
      this.undoCoverage = {
        undoable: undoList.undoable ?? [],
        redoable: undoList.redoable ?? [],
        recordedCount: undoList.recordedCount ?? undoList.undoable.length + undoList.redoable.length,
        nonUndoableRecent: undoList.nonUndoableRecent ?? [],
      };
      if (runConfigRes?.ok) {
        const rc = (await runConfigRes.json()) as RunConfigSnapshot;
        if (typeof rc.allowIrreversibleActions === "boolean") {
          this.allowIrreversibleActions = rc.allowIrreversibleActions;
        } else if (typeof rc.undoGuaranteeEnabled === "boolean") {
          this.allowIrreversibleActions = !rc.undoGuaranteeEnabled;
        }
      }
    } catch {
      // ignore
    } finally {
      this.undoLoading = false;
    }
  }

  private async toggleIrreversibleActions() {
    this.undoLoading = true;
    try {
      const res = await fetch("/api/chat/run-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowIrreversibleActions: !this.allowIrreversibleActions,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as RunConfigSnapshot;
        if (typeof data.allowIrreversibleActions === "boolean") {
          this.allowIrreversibleActions = data.allowIrreversibleActions;
        } else if (typeof data.undoGuaranteeEnabled === "boolean") {
          this.allowIrreversibleActions = !data.undoGuaranteeEnabled;
        }
      }
      await this.refreshUndoCoverage();
    } catch {
      this.undoLoading = false;
    }
  }

  private renderUndo() {
    const nonUndoable = this.undoCoverage.nonUndoableRecent ?? [];
    const recorded = this.undoCoverage.recordedCount ?? 0;
    const undoableCount = this.undoCoverage.undoable.length;
    const redoableCount = this.undoCoverage.redoable.length;
    return html`
      <div class="undo-mode-row">
        <div>
          <div class="undo-mode-title">Undo Guarantee</div>
          <div class="undo-mode-sub">
            ${this.allowIrreversibleActions
              ? "Irreversible actions are currently allowed."
              : "Irreversible mutate/exec actions are blocked."}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="undo-badge ${this.allowIrreversibleActions ? "open" : "strict"}">
            ${this.allowIrreversibleActions ? "open" : "strict"}
          </span>
          <button
            class="btn-key"
            ?disabled=${this.undoLoading}
            @click=${() => this.toggleIrreversibleActions()}
          >
            ${this.allowIrreversibleActions ? "Set Strict" : "Allow"}
          </button>
        </div>
      </div>

      <div class="undo-kpis">
        <div class="undo-kpi">
          <div class="undo-kpi-label">Recorded</div>
          <div class="undo-kpi-value">${recorded}</div>
        </div>
        <div class="undo-kpi">
          <div class="undo-kpi-label">Undoable</div>
          <div class="undo-kpi-value">${undoableCount}</div>
        </div>
        <div class="undo-kpi">
          <div class="undo-kpi-label">Redoable</div>
          <div class="undo-kpi-value">${redoableCount}</div>
        </div>
        <div class="undo-kpi">
          <div class="undo-kpi-label">Non-undoable recent</div>
          <div class="undo-kpi-value">${nonUndoable.length}</div>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
        <button
          class="btn-refresh"
          ?disabled=${this.undoLoading}
          @click=${() => this.refreshUndoCoverage()}
        >
          ${this.undoLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div class="undo-list">
        <div class="undo-list-header">Recent non-undoable actions</div>
        ${nonUndoable.length === 0
          ? html`<div class="undo-list-empty">No non-undoable actions in recent history.</div>`
          : nonUndoable.map((a) => html`
              <div class="undo-item">
                <div class="undo-item-top">
                  <span class="undo-item-tool">${a.tool}</span>
                  <span class="undo-item-meta">${a.category} · ${new Date(a.startedAt).toLocaleString()}</span>
                </div>
                ${a.error
                  ? html`<div class="undo-item-error">${a.error}</div>`
                  : html`<div class="undo-item-meta">No error detail recorded.</div>`}
              </div>
            `)}
      </div>
    `;
  }

  private renderBrowser() {
    return html`
      <div class="provider-row">
        <div class="provider-info">
          <div class="provider-label">Browser Mode</div>
          <div class="provider-url">${this.browserHeadless ? "Headless (invisible)" : "Headful (visible window)"}</div>
        </div>
        <span class="key-status ${this.browserHeadless ? "key-missing" : "key-set"}">${this.browserHeadless ? "Headless" : "Visible"}</span>
        <button class="btn-key" @click=${() => this.toggleBrowserHeadless(!this.browserHeadless)}>
          ${this.browserHeadless ? "Show Browser" : "Hide Browser"}
        </button>
      </div>
    `;
  }

  private renderVoice() {
    return html`
      <div class="provider-row">
        <div class="provider-info">
          <div class="provider-label">Text-to-Speech</div>
          <div class="provider-url">Controls gateway TTS state used by parity APIs.</div>
        </div>
        <span class="key-status ${this.tts.enabled ? "key-set" : "key-missing"}">${this.tts.enabled ? "Enabled" : "Disabled"}</span>
        <button class="btn-key" @click=${() => this.toggleVoiceEnabled(!this.tts.enabled)}>
          ${this.tts.enabled ? "Disable" : "Enable"}
        </button>
      </div>

      <div class="provider-row">
        <div class="provider-info">
          <div class="provider-label">Voice Provider</div>
          <div class="provider-url">Current: ${this.tts.provider}</div>
        </div>
        <select class="form-select" @change=${(e: Event) => this.selectVoiceProvider((e.target as HTMLSelectElement).value)}>
          ${this.tts.providers.map((provider) => html`
            <option value=${provider} ?selected=${provider === this.tts.provider}>${provider}</option>
          `)}
        </select>
      </div>

      <div class="provider-row">
        <div class="provider-info">
          <div class="provider-label">Add custom provider</div>
          <div class="provider-url">Registers provider name in gateway TTS providers list.</div>
        </div>
        <input
          class="form-input"
          type="text"
          .value=${this.customVoiceProvider}
          @input=${(e: Event) => {
            this.customVoiceProvider = (e.target as HTMLInputElement).value;
          }}
          placeholder="e.g. openai-tts"
        />
        <button class="btn-key" @click=${() => this.selectVoiceProvider(this.customVoiceProvider.trim())}>Add</button>
      </div>
    `;
  }

  private async refreshLocalModels() {
    this.refreshingLocal = true;
    try {
      const res = await fetch("/api/chat/local-models/refresh", { method: "POST" });
      if (res.ok) {
        const data = await res.json() as { models: ModelInfo[]; servers: LocalServerInfo[] };
        this.localServers = data.servers;
        await this.loadData();
      }
    } catch { /* ignore */ } finally {
      this.refreshingLocal = false;
    }
  }

  private isLocalProvider(providerId: string): boolean {
    const p = this.providers.find((prov) => prov.id === providerId);
    if (p?.local) return true;
    return providerId === "ollama" || providerId === "lmstudio";
  }

  private isServerAvailable(providerId: string): boolean {
    const server = this.localServers.find((s) => s.provider === providerId);
    if (server) return server.available;
    const p = this.providers.find((prov) => prov.id === providerId);
    return p?.available ?? false;
  }

  private async selectModel(provider: string, model: string) {
    const provInfo = this.providers.find((p) => p.id === provider);
    if (!provInfo?.hasKey && !this.isLocalProvider(provider)) return;
    try {
      const res = await fetch("/api/chat/model", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model }),
      });
      if (res.ok) {
        const data = await res.json() as { model: string; provider: string; name: string; capabilities: ModelInfo["capabilities"] };
        this.emit("model-changed", { model: data.model, provider: data.provider, name: data.name, capabilities: data.capabilities });
        this.currentModel = data.model;
        this.currentProvider = data.provider;
      }
    } catch { /* ignore */ }
  }

  private async setApiKey(providerId: string) {
    const current = this.providers.find((p) => p.id === providerId);
    const key = prompt(`API key for ${current?.name ?? providerId}:`, "");
    if (key === null) return;
    try {
      const res = await fetch("/api/chat/providers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, apiKey: key }),
      });
      if (res.ok) await this.loadData();
    } catch { /* ignore */ }
  }

  private async removeApiKey(providerId: string) {
    if (!confirm(`Remove API key for ${providerId}?`)) return;
    try {
      const res = await fetch("/api/chat/providers", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId }),
      });
      if (res.ok) await this.loadData();
    } catch { /* ignore */ }
  }

  private renderModels() {
    const grouped = new Map<string, ModelInfo[]>();
    for (const m of this.models) {
      const list = grouped.get(m.provider) ?? [];
      list.push(m);
      grouped.set(m.provider, list);
    }

    const hasLocalProviders = Array.from(grouped.keys()).some((p) => this.isLocalProvider(p));

    return html`
      ${hasLocalProviders ? html`
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--text-tertiary,#999); letter-spacing:0.8px;">Local Models</span>
          <button class="btn-refresh" ?disabled=${this.refreshingLocal} @click=${() => this.refreshLocalModels()}>
            ${this.refreshingLocal ? "Scanning..." : "Refresh"}
          </button>
        </div>
      ` : nothing}
      ${Array.from(grouped.entries()).map(([provider, models]) => {
        const provInfo = this.providers.find((p) => p.id === provider);
        const hasKey = provInfo?.hasKey ?? false;
        const isLocal = this.isLocalProvider(provider);
        const available = isLocal ? this.isServerAvailable(provider) : hasKey;
        return html`
          <div class="provider-group">
            <div class="provider-name">
              ${isLocal ? html`<span class="status-dot ${available ? "online" : "offline"}"></span>` : nothing}
              ${provInfo?.name ?? provider}
              ${isLocal && !available ? html`<span class="no-key-hint"> - offline</span>` : nothing}
              ${!hasKey && !isLocal ? html`<span class="no-key-hint"> - no API key</span>` : nothing}
            </div>
            ${models.length === 0 && isLocal ? html`
              <div class="no-models-hint">${available ? "No models loaded. Pull a model first." : "Server not running."}</div>
            ` : nothing}
            ${models.map((m) => html`
              <div class="model-row"
                ?data-active=${m.id === this.currentModel && m.provider === this.currentProvider}
                ?data-disabled=${!available}
                @click=${() => available ? this.selectModel(m.provider, m.id) : undefined}>
                <span class="model-name">${m.name}</span>
                <div class="model-caps">
                  ${m.capabilities.thinking ? html`<span class="cap-badge active">think</span>` : nothing}
                  ${m.capabilities.vision ? html`<span class="cap-badge">vision</span>` : nothing}
                  ${m.capabilities.tools ? html`<span class="cap-badge">tools</span>` : nothing}
                </div>
              </div>
            `)}
          </div>
        `;
      })}
    `;
  }

  private renderProviders() {
    return html`
      ${this.providers.map((p) => html`
        <div class="provider-row">
          <div class="provider-info">
            <div class="provider-label">${p.name}</div>
            <div class="provider-url">${p.baseUrl}</div>
          </div>
          <span class="key-status ${p.hasKey ? "key-set" : "key-missing"}">${p.hasKey ? "Key set" : "No key"}</span>
          <button class="btn-key" @click=${() => this.setApiKey(p.id)}>${p.hasKey ? "Update" : "Add key"}</button>
          ${p.hasKey ? html`<button class="btn-key danger" @click=${() => this.removeApiKey(p.id)}>Remove</button>` : nothing}
        </div>
      `)}
    `;
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this.emit("close-settings"); }}>
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">Settings</span>
            <button class="btn-close" @click=${() => this.emit("close-settings")}>&times;</button>
          </div>
          <div class="tabs">
            <button class="tab" ?data-active=${this.tab === "models"} @click=${() => this.tab = "models"}>Models</button>
            <button class="tab" ?data-active=${this.tab === "providers"} @click=${() => this.tab = "providers"}>API Keys</button>
            <button class="tab" ?data-active=${this.tab === "undo"} @click=${() => this.tab = "undo"}>Undo</button>
            <button class="tab" ?data-active=${this.tab === "voice"} @click=${() => this.tab = "voice"}>Voice</button>
            <button class="tab" ?data-active=${this.tab === "browser"} @click=${() => this.tab = "browser"}>Browser</button>
          </div>
          <div class="panel-body">
            ${this.tab === "models"
              ? this.renderModels()
              : this.tab === "providers"
                ? this.renderProviders()
                : this.tab === "undo"
                  ? this.renderUndo()
                : this.tab === "voice"
                  ? this.renderVoice()
                  : this.renderBrowser()}
          </div>
        </div>
      </div>
    `;
  }
}
