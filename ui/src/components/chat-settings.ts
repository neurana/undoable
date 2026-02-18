import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  api,
  type ChannelItem,
  type ChatApprovalMode,
  type ChatRunConfig,
  type ChatRunConfigPatch,
  type ChatThinkingConfig,
  type ChatThinkingPatch,
  type DaemonSettingsPatch,
  type DaemonSettingsSnapshot,
  type UndoListResult,
} from "../api/client.js";

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

@customElement("chat-settings")
export class ChatSettings extends LitElement {
  static styles = css`
    :host { display: block; }
    .standalone-shell {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 14px;
      min-height: calc(100vh - 140px);
    }
    .standalone-nav {
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 14px;
      background: var(--surface-1, #fff);
      padding: 8px;
      height: fit-content;
      position: sticky;
      top: 8px;
    }
    .standalone-title {
      font-size: 11px;
      color: var(--text-tertiary, #999);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      padding: 4px 6px 8px 6px;
    }
    .standalone-tab {
      width: 100%;
      border: none;
      background: transparent;
      text-align: left;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 12px;
      color: var(--text-secondary, #666);
      font-family: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .standalone-tab:hover { background: var(--wash, #f0f0f0); color: var(--text-primary, #1a1a1a); }
    .standalone-tab[data-active] {
      background: var(--accent-subtle, #e6f9f1);
      color: var(--text-primary, #1a1a1a);
      font-weight: 600;
    }
    .standalone-content {
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 14px;
      background: var(--surface-1, #fff);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 420px;
    }
    .standalone-header {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-divider, #e0e0e0);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: var(--bg-base, #fff);
    }
    .standalone-header-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary, #1a1a1a);
    }
    .standalone-header-sub {
      font-size: 11px;
      color: var(--text-tertiary, #999);
      margin-top: 2px;
    }
    .standalone-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      border-radius: 999px;
      border: 1px solid transparent;
      padding: 3px 8px;
    }
    .standalone-badge.warn {
      color: var(--danger, #c0392b);
      border-color: rgba(192, 57, 43, 0.22);
      background: rgba(192, 57, 43, 0.08);
    }
    .standalone-badge.ok {
      color: var(--accent, #00b377);
      border-color: rgba(0, 176, 120, 0.25);
      background: var(--accent-subtle, #e6f9f1);
    }
    .overlay {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0,0,0,0.4); backdrop-filter: blur(2px);
      display: flex; align-items: center; justify-content: center;
    }
    .panel {
      background: var(--bg-base, #fff); border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 16px; width: min(760px, 96vw); max-height: 84vh;
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
      overflow-x: auto;
      white-space: nowrap;
      scrollbar-width: thin;
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
    .runtime-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .runtime-card {
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 10px;
      padding: 10px;
      background: var(--surface-1, #fff);
    }
    .runtime-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--text-tertiary, #999);
      margin-bottom: 8px;
    }
    .runtime-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .runtime-row:last-child { margin-bottom: 0; }
    .runtime-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary, #1a1a1a);
    }
    .runtime-sub {
      font-size: 10px;
      color: var(--text-tertiary, #999);
      margin-top: 2px;
    }
    .runtime-stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .runtime-stat {
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 8px;
      padding: 8px;
      background: var(--surface-1, #fff);
    }
    .runtime-stat-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--text-tertiary, #999);
      font-weight: 700;
    }
    .runtime-stat-value {
      font-size: 12px;
      color: var(--text-primary, #1a1a1a);
      font-weight: 600;
      margin-top: 3px;
      font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    }
    .runtime-error {
      margin-top: 8px;
      color: var(--danger, #c0392b);
      font-size: 11px;
      line-height: 1.4;
    }
    .config-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .config-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    .config-input-wide {
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }
    .config-note {
      margin-top: 8px;
      font-size: 11px;
      color: var(--text-tertiary, #999);
      line-height: 1.4;
    }
    .runtime-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 8px;
    }
    .advanced-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .advanced-search {
      flex: 1;
      min-width: 0;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid var(--border-strong, #ccc);
      background: var(--surface-1, #fff);
      color: var(--text-primary, #1a1a1a);
      font-size: 11px;
      font-family: inherit;
    }
    .advanced-search:focus {
      outline: none;
      border-color: var(--accent, #00D090);
    }
    .advanced-section {
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 10px;
      padding: 10px;
      background: var(--surface-1, #fff);
      margin-bottom: 10px;
    }
    .advanced-section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--text-tertiary, #999);
      margin-bottom: 8px;
    }
    .advanced-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 0;
      border-bottom: 1px solid var(--border-divider, #e0e0e0);
    }
    .advanced-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .advanced-row:first-child {
      padding-top: 0;
    }
    .advanced-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary, #1a1a1a);
    }
    .advanced-sub {
      font-size: 10px;
      color: var(--text-tertiary, #999);
      margin-top: 2px;
    }
    .advanced-code {
      font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
      font-size: 11px;
      color: var(--text-secondary, #666);
      background: var(--wash, #f6f7f6);
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 6px;
      padding: 4px 6px;
    }
    .advanced-channel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .advanced-chip {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      border-radius: 999px;
      padding: 3px 8px;
      border: 1px solid var(--border-divider, #e0e0e0);
      color: var(--text-secondary, #666);
      background: var(--surface-1, #fff);
    }
    .advanced-chip.ok {
      color: var(--accent, #00D090);
      border-color: rgba(0, 176, 120, 0.25);
      background: var(--accent-subtle, #e6f9f1);
    }
    .advanced-channel-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .advanced-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .advanced-textarea {
      width: 100%;
      min-height: 58px;
      resize: vertical;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid var(--border-strong, #ccc);
      background: var(--surface-1, #fff);
      color: var(--text-primary, #1a1a1a);
      font-size: 11px;
      font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
      line-height: 1.35;
    }
    .advanced-textarea:focus {
      outline: none;
      border-color: var(--accent, #00D090);
    }
    .advanced-error {
      margin-top: 8px;
      font-size: 11px;
      color: var(--danger, #c0392b);
      line-height: 1.4;
    }
    .advanced-ok {
      margin-top: 8px;
      font-size: 11px;
      color: var(--accent, #00b377);
      line-height: 1.4;
    }
    .advanced-json {
      margin: 0;
      white-space: pre-wrap;
      font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
      font-size: 10px;
      line-height: 1.45;
      color: var(--text-secondary, #666);
      max-height: 220px;
      overflow: auto;
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 8px;
      background: var(--wash, #f6f7f6);
      padding: 8px;
    }
    @media (max-width: 700px) {
      .advanced-split {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 960px) {
      .standalone-shell {
        grid-template-columns: 1fr;
      }
      .standalone-nav {
        position: static;
      }
    }

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
  @property({ type: Boolean }) standalone = false;
  @property({ type: String }) currentModel = "";
  @property({ type: String }) currentProvider = "";

  @state() private tab:
    | "runtime"
    | "advanced"
    | "gateway"
    | "config"
    | "models"
    | "providers"
    | "voice"
    | "browser"
    | "undo" = "runtime";
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
  @state() private runMode: ChatRunConfig["mode"] = "interactive";
  @state() private approvalMode: ChatApprovalMode["mode"] = "off";
  @state() private configuredMaxIterations = 10;
  @state() private runtimeModel = "";
  @state() private runtimeProvider = "";
  @state() private dangerouslySkipPermissions = false;
  @state() private economyMode = false;
  @state() private economyMaxIterationsCap: number | null = null;
  @state() private economyToolResultMaxChars: number | null = null;
  @state() private economyContextMaxTokens: number | null = null;
  @state() private dailyBudgetUsd: number | null = null;
  @state() private spendPaused = false;
  @state() private autoPauseOnLimit = false;
  @state() private spentLast24hUsd = 0;
  @state() private remainingUsd: number | null = null;
  @state() private spendExceeded = false;
  @state() private canThink = false;
  @state() private thinkingLevel: ChatThinkingConfig["level"] = "off";
  @state() private reasoningVisibility: ChatThinkingConfig["visibility"] = "off";
  @state() private runtimeLoading = false;
  @state() private runtimeError = "";
  @state() private advancedLoading = false;
  @state() private advancedError = "";
  @state() private advancedSuccess = "";
  @state() private advancedSearch = "";
  @state() private advancedChannels: ChannelItem[] = [];
  @state() private daemonSettings: DaemonSettingsSnapshot | null = null;
  @state() private daemonLoading = false;
  @state() private daemonError = "";
  @state() private daemonSuccess = "";
  @state() private configLoading = false;
  @state() private configError = "";
  @state() private configSuccess = "";
  @state() private gatewayConfig: Record<string, unknown> | null = null;
  @state() private gatewayConfigDefault: Record<string, unknown> | null = null;
  @state() private configPatchText = "";
  @state() private channelDrafts: Record<
    string,
    { allowlist: string; blocklist: string; rateLimit: string; maxMediaBytes: string }
  > = {};

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
    if (changed.has("tab") && this.open && this.tab === "advanced") {
      void this.refreshAdvanced();
    }
    if (changed.has("tab") && this.open && this.tab === "gateway") {
      void this.refreshDaemonSettings();
    }
    if (changed.has("tab") && this.open && this.tab === "config") {
      void this.refreshConfigConsole();
    }
  }

  private applyRunConfigSnapshot(config: ChatRunConfig) {
    this.runMode = config.mode;
    this.approvalMode = config.approvalMode;
    this.configuredMaxIterations =
      typeof config.configuredMaxIterations === "number"
        ? config.configuredMaxIterations
        : config.maxIterations;
    this.economyMode = config.economyMode;
    this.allowIrreversibleActions = config.allowIrreversibleActions;
    this.runtimeModel = config.model ?? "";
    this.runtimeProvider = config.provider ?? "";
    if (!this.currentModel && config.model) this.currentModel = config.model;
    if (!this.currentProvider && config.provider) this.currentProvider = config.provider;
    this.dangerouslySkipPermissions = config.dangerouslySkipPermissions === true;
    this.canThink = config.canThink === true;
    this.thinkingLevel = config.thinking;
    this.reasoningVisibility = config.reasoningVisibility;
    this.economyMaxIterationsCap =
      typeof config.economy?.maxIterationsCap === "number"
        ? config.economy.maxIterationsCap
        : null;
    this.economyToolResultMaxChars =
      typeof config.economy?.toolResultMaxChars === "number"
        ? config.economy.toolResultMaxChars
        : null;
    this.economyContextMaxTokens =
      typeof config.economy?.contextMaxTokens === "number"
        ? config.economy.contextMaxTokens
        : null;

    const spend = config.spendGuard;
    this.dailyBudgetUsd =
      typeof spend?.dailyBudgetUsd === "number"
        ? spend.dailyBudgetUsd
        : null;
    this.spendPaused = spend?.paused === true;
    this.autoPauseOnLimit = spend?.autoPauseOnLimit === true;
    this.spentLast24hUsd =
      typeof spend?.spentLast24hUsd === "number" ? spend.spentLast24hUsd : 0;
    this.remainingUsd =
      typeof spend?.remainingUsd === "number" ? spend.remainingUsd : null;
    this.spendExceeded = spend?.exceeded === true;
  }

  private applyThinkingSnapshot(thinking: ChatThinkingConfig) {
    this.thinkingLevel = thinking.level;
    this.reasoningVisibility = thinking.visibility;
    if (typeof thinking.canThink === "boolean") {
      this.canThink = thinking.canThink;
    }
  }

  private async readRuntimeState() {
    const [runConfig, approval, thinking] = await Promise.all([
      api.chat.getRunConfig().catch(() => null),
      api.chat.getApprovalMode().catch(() => null),
      api.chat.getThinking().catch(() => null),
    ]);
    if (runConfig) this.applyRunConfigSnapshot(runConfig);
    if (approval) this.approvalMode = approval.mode;
    if (thinking) this.applyThinkingSnapshot(thinking);
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
        runConfig,
        approvalMode,
        thinkingConfig,
        channelsList,
      ] = await Promise.all([
        fetch("/api/chat/models"),
        fetch("/api/chat/providers"),
        fetch("/api/chat/local-servers").catch(() => null),
        api.gateway.tts.status().catch(() => null),
        api.gateway.tts.providers().catch(() => null),
        api.gateway.browser.isHeadless().catch(() => null),
        api.undo.list().catch(() => null),
        api.chat.getRunConfig().catch(() => null),
        api.chat.getApprovalMode().catch(() => null),
        api.chat.getThinking().catch(() => null),
        api.channels.list().catch(() => null),
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
      if (runConfig) this.applyRunConfigSnapshot(runConfig);
      if (approvalMode) this.approvalMode = approvalMode.mode;
      if (thinkingConfig) this.applyThinkingSnapshot(thinkingConfig);
      if (Array.isArray(channelsList)) {
        this.advancedChannels = channelsList;
        this.syncChannelDrafts(channelsList);
      }
      await Promise.all([
        this.refreshDaemonSettings().catch(() => undefined),
        this.refreshConfigConsole().catch(() => undefined),
      ]);
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
      const [undoList, runConfig] = await Promise.all([
        api.undo.list(),
        api.chat.getRunConfig().catch(() => null),
      ]);
      this.undoCoverage = {
        undoable: undoList.undoable ?? [],
        redoable: undoList.redoable ?? [],
        recordedCount: undoList.recordedCount ?? undoList.undoable.length + undoList.redoable.length,
        nonUndoableRecent: undoList.nonUndoableRecent ?? [],
      };
      if (runConfig) this.applyRunConfigSnapshot(runConfig);
    } catch {
      // ignore
    } finally {
      this.undoLoading = false;
    }
  }

  private async toggleIrreversibleActions() {
    this.undoLoading = true;
    try {
      const data = await api.chat.updateRunConfig({
        allowIrreversibleActions: !this.allowIrreversibleActions,
      });
      this.applyRunConfigSnapshot(data);
      await this.refreshUndoCoverage();
    } catch {
      this.undoLoading = false;
    }
  }

  private formatUsd(value: number | null): string {
    if (typeof value !== "number" || !Number.isFinite(value)) return "off";
    return `$${value.toFixed(2)}`;
  }

  private async applyRuntimePatch(patch: ChatRunConfigPatch) {
    this.runtimeLoading = true;
    this.runtimeError = "";
    try {
      const next = await api.chat.updateRunConfig(patch);
      this.applyRunConfigSnapshot(next);
    } catch (err) {
      this.runtimeError =
        err instanceof Error ? err.message : "Failed to update runtime settings.";
    } finally {
      this.runtimeLoading = false;
    }
  }

  private async applyApprovalMode(mode: ChatApprovalMode["mode"]) {
    this.runtimeLoading = true;
    this.runtimeError = "";
    try {
      const result = await api.chat.setApprovalMode(mode);
      this.approvalMode = result.mode;
    } catch (err) {
      this.runtimeError =
        err instanceof Error ? err.message : "Failed to update approval mode.";
    } finally {
      this.runtimeLoading = false;
    }
  }

  private async applyThinkingPatch(patch: ChatThinkingPatch) {
    this.runtimeLoading = true;
    this.runtimeError = "";
    try {
      const result = await api.chat.setThinking(patch);
      this.applyThinkingSnapshot(result);
    } catch (err) {
      this.runtimeError =
        err instanceof Error ? err.message : "Failed to update thinking settings.";
    } finally {
      this.runtimeLoading = false;
    }
  }

  private async setMaxIterationsInput(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      this.runtimeError = "Max iterations must be a positive number.";
      return;
    }
    await this.applyRuntimePatch({ maxIterations: Math.floor(parsed) });
  }

  private async setDailyBudgetInput(value: string) {
    const raw = value.trim();
    if (raw.length === 0 || raw.toLowerCase() === "off") {
      await this.applyRuntimePatch({ dailyBudgetUsd: null });
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      this.runtimeError = "Daily budget must be a positive number, or blank/off.";
      return;
    }
    await this.applyRuntimePatch({ dailyBudgetUsd: parsed });
  }

  private async applyRuntimePreset(preset: "power" | "balanced" | "economy") {
    this.runtimeLoading = true;
    this.runtimeError = "";
    try {
      if (preset === "economy") {
        await Promise.all([
          api.chat.updateRunConfig({
            economyMode: true,
            mode: "supervised",
            maxIterations: 6,
            allowIrreversibleActions: false,
          }),
          api.chat.setApprovalMode("always"),
          api.chat.setThinking({ level: "off", visibility: "off" }),
        ]);
      } else if (preset === "balanced") {
        await Promise.all([
          api.chat.updateRunConfig({
            economyMode: false,
            mode: "supervised",
            maxIterations: 12,
            allowIrreversibleActions: false,
          }),
          api.chat.setApprovalMode("mutate"),
          api.chat.setThinking({ level: "medium", visibility: "stream" }),
        ]);
      } else {
        await Promise.all([
          api.chat.updateRunConfig({
            economyMode: false,
            mode: "autonomous",
            maxIterations: 30,
            allowIrreversibleActions: true,
          }),
          api.chat.setApprovalMode("off"),
          api.chat.setThinking({ level: "high", visibility: "stream" }),
        ]);
      }
      await this.readRuntimeState();
    } catch (err) {
      this.runtimeError =
        err instanceof Error ? err.message : "Failed to apply preset.";
    } finally {
      this.runtimeLoading = false;
    }
  }

  private async refreshRuntime() {
    this.runtimeLoading = true;
    this.runtimeError = "";
    try {
      await this.readRuntimeState();
    } catch (err) {
      this.runtimeError =
        err instanceof Error ? err.message : "Failed to refresh runtime settings.";
    } finally {
      this.runtimeLoading = false;
    }
  }

  private syncChannelDrafts(channels: ChannelItem[]) {
    const next: Record<
      string,
      { allowlist: string; blocklist: string; rateLimit: string; maxMediaBytes: string }
    > = {};
    for (const channel of channels) {
      const id = channel.config.channelId;
      next[id] = {
        allowlist: (channel.config.userAllowlist ?? []).join(", "),
        blocklist: (channel.config.userBlocklist ?? []).join(", "),
        rateLimit:
          typeof channel.config.rateLimit === "number"
            ? String(channel.config.rateLimit)
            : "",
        maxMediaBytes:
          typeof channel.config.maxMediaBytes === "number"
            ? String(channel.config.maxMediaBytes)
            : "",
      };
    }
    this.channelDrafts = next;
  }

  private toIdList(raw: string): string[] {
    return raw
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  private setChannelDraftValue(
    channelId: string,
    key: "allowlist" | "blocklist" | "rateLimit" | "maxMediaBytes",
    value: string,
  ) {
    this.channelDrafts = {
      ...this.channelDrafts,
      [channelId]: {
        allowlist: this.channelDrafts[channelId]?.allowlist ?? "",
        blocklist: this.channelDrafts[channelId]?.blocklist ?? "",
        rateLimit: this.channelDrafts[channelId]?.rateLimit ?? "",
        maxMediaBytes: this.channelDrafts[channelId]?.maxMediaBytes ?? "",
        [key]: value,
      },
    };
  }

  private async refreshAdvanced() {
    this.advancedLoading = true;
    this.advancedError = "";
    this.advancedSuccess = "";
    try {
      const [channels] = await Promise.all([
        api.channels.list(),
        this.readRuntimeState(),
      ]);
      this.advancedChannels = channels;
      this.syncChannelDrafts(channels);
    } catch (err) {
      this.advancedError =
        err instanceof Error ? err.message : "Failed to load advanced settings.";
    } finally {
      this.advancedLoading = false;
    }
  }

  private async patchChannelConfig(
    channelId: string,
    patch: {
      enabled?: boolean;
      allowDMs?: boolean;
      allowGroups?: boolean;
      userAllowlist?: string[];
      userBlocklist?: string[];
      rateLimit?: number;
      maxMediaBytes?: number;
    },
    successLabel: string,
  ) {
    this.advancedLoading = true;
    this.advancedError = "";
    this.advancedSuccess = "";
    try {
      await api.channels.update(channelId, patch);
      const channels = await api.channels.list();
      this.advancedChannels = channels;
      this.syncChannelDrafts(channels);
      this.advancedSuccess = successLabel;
    } catch (err) {
      this.advancedError =
        err instanceof Error ? err.message : `Failed to update ${channelId}.`;
    } finally {
      this.advancedLoading = false;
    }
  }

  private async setChannelEnabled(channel: ChannelItem, enabled: boolean) {
    const channelId = channel.config.channelId;
    this.advancedLoading = true;
    this.advancedError = "";
    this.advancedSuccess = "";
    try {
      await api.channels.update(channelId, { enabled });
      if (enabled) {
        await api.channels.start(channelId).catch(() => undefined);
      } else {
        await api.channels.stop(channelId).catch(() => undefined);
      }
      const channels = await api.channels.list();
      this.advancedChannels = channels;
      this.syncChannelDrafts(channels);
      this.advancedSuccess = `${channelId} ${enabled ? "enabled" : "disabled"}.`;
    } catch (err) {
      this.advancedError =
        err instanceof Error ? err.message : `Failed to toggle ${channelId}.`;
    } finally {
      this.advancedLoading = false;
    }
  }

  private async saveChannelLists(channelId: string) {
    const draft = this.channelDrafts[channelId];
    if (!draft) return;
    await this.patchChannelConfig(
      channelId,
      {
        userAllowlist: this.toIdList(draft.allowlist),
        userBlocklist: this.toIdList(draft.blocklist),
      },
      `${channelId} allow/block lists saved.`,
    );
  }

  private async saveChannelLimits(channelId: string) {
    const draft = this.channelDrafts[channelId];
    if (!draft) return;
    const patch: { rateLimit?: number; maxMediaBytes?: number } = {};
    if (draft.rateLimit.trim().length > 0) {
      const rate = Number(draft.rateLimit.trim());
      if (!Number.isFinite(rate) || rate < 0) {
        this.advancedError = "rateLimit must be zero or a positive number.";
        return;
      }
      patch.rateLimit = Math.floor(rate);
    }
    if (draft.maxMediaBytes.trim().length > 0) {
      const maxMedia = Number(draft.maxMediaBytes.trim());
      if (!Number.isFinite(maxMedia) || maxMedia <= 0) {
        this.advancedError = "maxMediaBytes must be a positive number.";
        return;
      }
      patch.maxMediaBytes = Math.floor(maxMedia);
    }
    await this.patchChannelConfig(channelId, patch, `${channelId} limits saved.`);
  }

  private async refreshDaemonSettings() {
    this.daemonLoading = true;
    this.daemonError = "";
    try {
      this.daemonSettings = await api.settings.daemon.get();
    } catch (err) {
      this.daemonError =
        err instanceof Error ? err.message : "Failed to load daemon settings.";
    } finally {
      this.daemonLoading = false;
    }
  }

  private async patchDaemonSettings(patch: DaemonSettingsPatch) {
    this.daemonLoading = true;
    this.daemonError = "";
    this.daemonSuccess = "";
    try {
      const next = await api.settings.daemon.update(patch);
      this.daemonSettings = next;
      this.daemonSuccess = "Daemon settings saved. Restart daemon to apply changes.";
    } catch (err) {
      this.daemonError =
        err instanceof Error ? err.message : "Failed to update daemon settings.";
    } finally {
      this.daemonLoading = false;
    }
  }

  private getConfigValue(pathKey: string): unknown {
    const source = this.gatewayConfig;
    if (!source) return undefined;
    const parts = pathKey.split(".");
    let current: unknown = source;
    for (const part of parts) {
      if (!current || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private async refreshConfigConsole() {
    this.configLoading = true;
    this.configError = "";
    try {
      const [cfg, schema] = await Promise.all([
        api.gateway.call("config.get", {}),
        api.gateway.call("config.schema", {}),
      ]);
      const configObj =
        cfg && typeof cfg === "object" && "config" in (cfg as Record<string, unknown>)
          ? ((cfg as { config?: Record<string, unknown> }).config ?? {})
          : {};
      const defaultObj =
        schema && typeof schema === "object" && "default" in (schema as Record<string, unknown>)
          ? ((schema as { default?: Record<string, unknown> }).default ?? {})
          : {};
      this.gatewayConfig = configObj;
      this.gatewayConfigDefault = defaultObj;
      this.configPatchText = JSON.stringify(configObj, null, 2);
    } catch (err) {
      this.configError =
        err instanceof Error ? err.message : "Failed to load config schema.";
    } finally {
      this.configLoading = false;
    }
  }

  private async setConfigValue(key: string, value: unknown) {
    this.configLoading = true;
    this.configError = "";
    this.configSuccess = "";
    try {
      await api.gateway.call("config.set", { key, value });
      await this.refreshConfigConsole();
      this.configSuccess = `${key} updated.`;
    } catch (err) {
      this.configError =
        err instanceof Error ? err.message : `Failed to set ${key}.`;
      this.configLoading = false;
    }
  }

  private async applyRawConfigPatch() {
    this.configLoading = true;
    this.configError = "";
    this.configSuccess = "";
    try {
      const patch = JSON.parse(this.configPatchText) as Record<string, unknown>;
      await api.gateway.call("config.patch", { patch });
      await this.refreshConfigConsole();
      this.configSuccess = "Config patch applied.";
    } catch (err) {
      this.configError =
        err instanceof Error ? err.message : "Invalid config patch JSON.";
      this.configLoading = false;
    }
  }

  private async resetConfigToDefault() {
    this.configLoading = true;
    this.configError = "";
    this.configSuccess = "";
    try {
      if (!this.gatewayConfigDefault) {
        await this.refreshConfigConsole();
      }
      await api.gateway.call("config.apply", { config: this.gatewayConfigDefault ?? {} });
      await this.refreshConfigConsole();
      this.configSuccess = "Config reset to defaults.";
    } catch (err) {
      this.configError =
        err instanceof Error ? err.message : "Failed to reset config.";
      this.configLoading = false;
    }
  }

  private renderRuntime() {
    return html`
      <div class="runtime-grid">
        <div class="runtime-card">
          <div class="runtime-title">Execution</div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Run mode</div>
              <div class="runtime-sub">interactive, autonomous, or supervised.</div>
            </div>
            <select
              class="form-select"
              .value=${this.runMode}
              ?disabled=${this.runtimeLoading}
              @change=${(e: Event) =>
                this.applyRuntimePatch({
                  mode: (e.target as HTMLSelectElement).value as ChatRunConfig["mode"],
                })}
            >
              <option value="interactive">interactive</option>
              <option value="supervised">supervised</option>
              <option value="autonomous">autonomous</option>
            </select>
          </div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Approval mode</div>
              <div class="runtime-sub">Permission checks for tool actions.</div>
            </div>
            <select
              class="form-select"
              .value=${this.approvalMode}
              ?disabled=${this.runtimeLoading}
              @change=${(e: Event) =>
                this.applyApprovalMode(
                  (e.target as HTMLSelectElement).value as ChatApprovalMode["mode"],
                )}
            >
              <option value="off">off</option>
              <option value="mutate">mutate</option>
              <option value="always">always</option>
            </select>
          </div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Max iterations</div>
              <div class="runtime-sub">Tool loop upper bound per run.</div>
            </div>
            <input
              class="form-input"
              style="max-width:120px;"
              type="number"
              min="1"
              .value=${String(this.configuredMaxIterations)}
              ?disabled=${this.runtimeLoading}
              @change=${(e: Event) =>
                this.setMaxIterationsInput((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Economy mode</div>
              <div class="runtime-sub">Lowers token use with tighter caps.</div>
            </div>
            <button
              class="btn-key"
              ?disabled=${this.runtimeLoading}
              @click=${() =>
                this.applyRuntimePatch({ economyMode: !this.economyMode })}
            >
              ${this.economyMode ? "Turn Off" : "Turn On"}
            </button>
          </div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Undo guarantee</div>
              <div class="runtime-sub">Strict blocks non-undoable mutations.</div>
            </div>
            <button
              class="btn-key ${this.allowIrreversibleActions ? "danger" : ""}"
              ?disabled=${this.runtimeLoading}
              @click=${() =>
                this.applyRuntimePatch({
                  allowIrreversibleActions: !this.allowIrreversibleActions,
                })}
            >
              ${this.allowIrreversibleActions ? "Open" : "Strict"}
            </button>
          </div>
        </div>

        <div class="runtime-card">
          <div class="runtime-title">Thinking</div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Thinking level</div>
              <div class="runtime-sub">Reasoning effort for supported models.</div>
            </div>
            <select
              class="form-select"
              .value=${this.thinkingLevel}
              ?disabled=${this.runtimeLoading}
              @change=${(e: Event) =>
                this.applyThinkingPatch({
                  level: (e.target as HTMLSelectElement).value as ChatThinkingConfig["level"],
                })}
            >
              <option value="off">off</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Reasoning visibility</div>
              <div class="runtime-sub">How internal reasoning is exposed in chat.</div>
            </div>
            <select
              class="form-select"
              .value=${this.reasoningVisibility}
              ?disabled=${this.runtimeLoading}
              @change=${(e: Event) =>
                this.applyThinkingPatch({
                  visibility:
                    (e.target as HTMLSelectElement)
                      .value as ChatThinkingConfig["visibility"],
                })}
            >
              <option value="off">off</option>
              <option value="on">on</option>
              <option value="stream">stream</option>
            </select>
          </div>
          <div class="runtime-sub">Thinking available now: ${this.canThink ? "yes" : "no"}</div>
        </div>

        <div class="runtime-card">
          <div class="runtime-title">Snapshot</div>
          <div class="runtime-stats">
            <div class="runtime-stat">
              <div class="runtime-stat-label">Provider</div>
              <div class="runtime-stat-value">${this.runtimeProvider || "-"}</div>
            </div>
            <div class="runtime-stat">
              <div class="runtime-stat-label">Model</div>
              <div class="runtime-stat-value">${this.runtimeModel || "-"}</div>
            </div>
            <div class="runtime-stat">
              <div class="runtime-stat-label">Perm bypass</div>
              <div class="runtime-stat-value">
                ${this.dangerouslySkipPermissions ? "on" : "off"}
              </div>
            </div>
            <div class="runtime-stat">
              <div class="runtime-stat-label">Auto-pause</div>
              <div class="runtime-stat-value">${this.autoPauseOnLimit ? "on" : "off"}</div>
            </div>
            <div class="runtime-stat">
              <div class="runtime-stat-label">Economy iter cap</div>
              <div class="runtime-stat-value">
                ${this.economyMaxIterationsCap === null
                  ? "-"
                  : String(this.economyMaxIterationsCap)}
              </div>
            </div>
            <div class="runtime-stat">
              <div class="runtime-stat-label">Tool result cap</div>
              <div class="runtime-stat-value">
                ${this.economyToolResultMaxChars === null
                  ? "-"
                  : String(this.economyToolResultMaxChars)}
              </div>
            </div>
            <div class="runtime-stat">
              <div class="runtime-stat-label">Context max tokens</div>
              <div class="runtime-stat-value">
                ${this.economyContextMaxTokens === null
                  ? "-"
                  : String(this.economyContextMaxTokens)}
              </div>
            </div>
          </div>
        </div>

        <div class="runtime-card">
          <div class="runtime-title">Profiles</div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Balanced</div>
              <div class="runtime-sub">Supervised, mutate approvals, medium thinking.</div>
            </div>
            <button
              class="btn-key"
              ?disabled=${this.runtimeLoading}
              @click=${() => this.applyRuntimePreset("balanced")}
            >
              Apply
            </button>
          </div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Economy</div>
              <div class="runtime-sub">Strict + low cost defaults.</div>
            </div>
            <button
              class="btn-key"
              ?disabled=${this.runtimeLoading}
              @click=${() => this.applyRuntimePreset("economy")}
            >
              Apply
            </button>
          </div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Power</div>
              <div class="runtime-sub">Autonomous, no approvals, high thinking.</div>
            </div>
            <button
              class="btn-key danger"
              ?disabled=${this.runtimeLoading}
              @click=${() => this.applyRuntimePreset("power")}
            >
              Apply
            </button>
          </div>
        </div>

        <div class="runtime-card">
          <div class="runtime-title">Spend Guard</div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Daily budget (USD)</div>
              <div class="runtime-sub">Leave blank or use "off" to disable.</div>
            </div>
            <input
              class="form-input"
              style="max-width:120px;"
              type="text"
              .value=${this.dailyBudgetUsd === null ? "" : String(this.dailyBudgetUsd)}
              ?disabled=${this.runtimeLoading}
              @change=${(e: Event) =>
                this.setDailyBudgetInput((e.target as HTMLInputElement).value)}
              placeholder="off"
            />
          </div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Pause new runs</div>
              <div class="runtime-sub">
                Manual pause while over budget. Auto-pause: ${this.autoPauseOnLimit ? "on" : "off"}.
              </div>
            </div>
            <button
              class="btn-key"
              ?disabled=${this.runtimeLoading}
              @click=${() =>
                this.applyRuntimePatch({ spendPaused: !this.spendPaused })}
            >
              ${this.spendPaused ? "Resume" : "Pause"}
            </button>
          </div>
          <div class="runtime-stats">
            <div class="runtime-stat">
              <div class="runtime-stat-label">Budget</div>
              <div class="runtime-stat-value">${this.formatUsd(this.dailyBudgetUsd)}</div>
            </div>
            <div class="runtime-stat">
              <div class="runtime-stat-label">24h spend</div>
              <div class="runtime-stat-value">${this.formatUsd(this.spentLast24hUsd)}</div>
            </div>
            <div class="runtime-stat">
              <div class="runtime-stat-label">Remaining</div>
              <div class="runtime-stat-value">${this.formatUsd(this.remainingUsd)}</div>
            </div>
            <div class="runtime-stat">
              <div class="runtime-stat-label">Status</div>
              <div class="runtime-stat-value">
                ${this.spendPaused
                  ? "paused"
                  : this.spendExceeded
                    ? "limit"
                    : "running"}
              </div>
            </div>
          </div>
          <div class="runtime-actions">
            <button
              class="btn-refresh"
              ?disabled=${this.runtimeLoading}
              @click=${() => this.refreshRuntime()}
            >
              ${this.runtimeLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          ${this.runtimeError
            ? html`<div class="runtime-error">${this.runtimeError}</div>`
            : nothing}
        </div>
      </div>
    `;
  }

  private renderAdvanced() {
    const q = this.advancedSearch.trim().toLowerCase();
    const matches = (...fields: Array<string | undefined>) =>
      q.length === 0 ||
      fields.some((v) => typeof v === "string" && v.toLowerCase().includes(q));

    const channels = this.advancedChannels.filter((ch) =>
      matches(
        ch.config.channelId,
        ch.status.accountName,
        ch.snapshot?.status,
        ch.snapshot?.error,
        "channel",
      ),
    );

    const snapshot = {
      runtime: {
        mode: this.runMode,
        approvalMode: this.approvalMode,
        maxIterations: this.configuredMaxIterations,
        economyMode: this.economyMode,
        allowIrreversibleActions: this.allowIrreversibleActions,
        provider: this.runtimeProvider,
        model: this.runtimeModel,
      },
      thinking: {
        level: this.thinkingLevel,
        visibility: this.reasoningVisibility,
        canThink: this.canThink,
      },
      spendGuard: {
        dailyBudgetUsd: this.dailyBudgetUsd,
        spentLast24hUsd: this.spentLast24hUsd,
        remainingUsd: this.remainingUsd,
        paused: this.spendPaused,
        exceeded: this.spendExceeded,
        autoPauseOnLimit: this.autoPauseOnLimit,
      },
      channels: this.advancedChannels.map((ch) => ({
        id: ch.config.channelId,
        enabled: ch.config.enabled,
        connected: ch.status.connected,
        dmPolicy: ch.snapshot?.dmPolicy,
        status: ch.snapshot?.status,
        allowDMs: ch.config.allowDMs,
        allowGroups: ch.config.allowGroups,
        rateLimit: ch.config.rateLimit,
        maxMediaBytes: ch.config.maxMediaBytes,
      })),
    };

    return html`
      <div class="advanced-toolbar">
        <input
          class="advanced-search"
          type="search"
          .value=${this.advancedSearch}
          @input=${(e: Event) =>
            (this.advancedSearch = (e.target as HTMLInputElement).value)}
          placeholder="Search settings (runtime, channels, safety...)"
        />
        <button
          class="btn-refresh"
          ?disabled=${this.advancedLoading}
          @click=${() => this.refreshAdvanced()}
        >
          ${this.advancedLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      ${matches("runtime", "mode", "approval", "thinking", "budget", "economy", "undo")
        ? html`
            <div class="advanced-section">
              <div class="advanced-section-title">Runtime & Safety</div>
              <div class="advanced-row">
                <div>
                  <div class="advanced-label">Run mode</div>
                  <div class="advanced-sub">Execution behavior for tool loops.</div>
                </div>
                <select
                  class="form-select"
                  .value=${this.runMode}
                  ?disabled=${this.advancedLoading}
                  @change=${(e: Event) =>
                    this.applyRuntimePatch({
                      mode: (e.target as HTMLSelectElement).value as ChatRunConfig["mode"],
                    })}
                >
                  <option value="interactive">interactive</option>
                  <option value="supervised">supervised</option>
                  <option value="autonomous">autonomous</option>
                </select>
              </div>
              <div class="advanced-row">
                <div>
                  <div class="advanced-label">Approval mode</div>
                  <div class="advanced-sub">Permission gate before tool execution.</div>
                </div>
                <select
                  class="form-select"
                  .value=${this.approvalMode}
                  ?disabled=${this.advancedLoading}
                  @change=${(e: Event) =>
                    this.applyApprovalMode(
                      (e.target as HTMLSelectElement).value as ChatApprovalMode["mode"],
                    )}
                >
                  <option value="off">off</option>
                  <option value="mutate">mutate</option>
                  <option value="always">always</option>
                </select>
              </div>
              <div class="advanced-row">
                <div>
                  <div class="advanced-label">Undo guarantee</div>
                  <div class="advanced-sub">Strict blocks non-undoable mutate/exec.</div>
                </div>
                <button
                  class="btn-key ${this.allowIrreversibleActions ? "danger" : ""}"
                  ?disabled=${this.advancedLoading}
                  @click=${() =>
                    this.applyRuntimePatch({
                      allowIrreversibleActions: !this.allowIrreversibleActions,
                    })}
                >
                  ${this.allowIrreversibleActions ? "Open" : "Strict"}
                </button>
              </div>
              <div class="advanced-row">
                <div>
                  <div class="advanced-label">Thinking level</div>
                  <div class="advanced-sub">Reasoning effort for supported models.</div>
                </div>
                <select
                  class="form-select"
                  .value=${this.thinkingLevel}
                  ?disabled=${this.advancedLoading}
                  @change=${(e: Event) =>
                    this.applyThinkingPatch({
                      level: (e.target as HTMLSelectElement).value as ChatThinkingConfig["level"],
                    })}
                >
                  <option value="off">off</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
              <div class="advanced-row">
                <div>
                  <div class="advanced-label">Reasoning visibility</div>
                  <div class="advanced-sub">Hide/show model thinking in chat.</div>
                </div>
                <select
                  class="form-select"
                  .value=${this.reasoningVisibility}
                  ?disabled=${this.advancedLoading}
                  @change=${(e: Event) =>
                    this.applyThinkingPatch({
                      visibility:
                        (e.target as HTMLSelectElement)
                          .value as ChatThinkingConfig["visibility"],
                    })}
                >
                  <option value="off">off</option>
                  <option value="on">on</option>
                  <option value="stream">stream</option>
                </select>
              </div>
              <div class="advanced-row">
                <div>
                  <div class="advanced-label">Daily budget (USD)</div>
                  <div class="advanced-sub">Blank/off disables spend guard.</div>
                </div>
                <input
                  class="form-input"
                  style="max-width:120px;"
                  type="text"
                  .value=${this.dailyBudgetUsd === null ? "" : String(this.dailyBudgetUsd)}
                  ?disabled=${this.advancedLoading}
                  @change=${(e: Event) =>
                    this.setDailyBudgetInput((e.target as HTMLInputElement).value)}
                  placeholder="off"
                />
              </div>
              <div class="advanced-row">
                <div>
                  <div class="advanced-label">Runtime snapshot</div>
                  <div class="advanced-sub">Current provider/model and permission state.</div>
                </div>
                <span class="advanced-code">
                  ${this.runtimeProvider || "-"} / ${this.runtimeModel || "-"} · perm=${this.dangerouslySkipPermissions
                    ? "skip"
                    : "normal"}
                </span>
              </div>
            </div>
          `
        : nothing}

      ${matches("channels", "dm", "group", "allowlist", "blocklist", "rate", "media")
        ? html`
            <div class="advanced-section">
              <div class="advanced-section-title">Channels</div>
              ${channels.length === 0
                ? html`<div class="advanced-sub">No channels found for this filter.</div>`
                : html`
                    <div class="advanced-channel-grid">
                      ${channels.map((channel) => {
                        const channelId = channel.config.channelId;
                        const draft = this.channelDrafts[channelId] ?? {
                          allowlist: "",
                          blocklist: "",
                          rateLimit: "",
                          maxMediaBytes: "",
                        };
                        return html`
                          <div class="advanced-section">
                            <div class="advanced-channel-head">
                              <div>
                                <div class="advanced-label">${channelId}</div>
                                <div class="advanced-sub">
                                  ${channel.status.accountName ?? "no account"} · status:
                                  ${channel.snapshot?.status ?? (channel.status.connected ? "connected" : "offline")}
                                </div>
                              </div>
                              <span class="advanced-chip ${channel.status.connected ? "ok" : ""}">
                                ${channel.status.connected ? "connected" : "offline"}
                              </span>
                            </div>
                            <div class="advanced-row">
                              <div>
                                <div class="advanced-label">Enabled</div>
                                <div class="advanced-sub">Start/stop connector lifecycle.</div>
                              </div>
                              <button
                                class="btn-key ${channel.config.enabled ? "danger" : ""}"
                                ?disabled=${this.advancedLoading}
                                @click=${() =>
                                  this.setChannelEnabled(channel, !channel.config.enabled)}
                              >
                                ${channel.config.enabled ? "Disable" : "Enable"}
                              </button>
                            </div>
                            <div class="advanced-row">
                              <div>
                                <div class="advanced-label">DM policy gate</div>
                                <div class="advanced-sub">Allow direct-message handling.</div>
                              </div>
                              <select
                                class="form-select"
                                .value=${String(channel.config.allowDMs ?? true)}
                                ?disabled=${this.advancedLoading}
                                @change=${(e: Event) =>
                                  this.patchChannelConfig(
                                    channelId,
                                    { allowDMs: (e.target as HTMLSelectElement).value === "true" },
                                    `${channelId} DM policy updated.`,
                                  )}
                              >
                                <option value="true">allow</option>
                                <option value="false">deny</option>
                              </select>
                            </div>
                            <div class="advanced-row">
                              <div>
                                <div class="advanced-label">Group policy gate</div>
                                <div class="advanced-sub">Allow group and channel handling.</div>
                              </div>
                              <select
                                class="form-select"
                                .value=${String(channel.config.allowGroups ?? true)}
                                ?disabled=${this.advancedLoading}
                                @change=${(e: Event) =>
                                  this.patchChannelConfig(
                                    channelId,
                                    {
                                      allowGroups:
                                        (e.target as HTMLSelectElement).value === "true",
                                    },
                                    `${channelId} group policy updated.`,
                                  )}
                              >
                                <option value="true">allow</option>
                                <option value="false">deny</option>
                              </select>
                            </div>
                            <div class="advanced-split" style="margin-top:8px;">
                              <input
                                class="form-input"
                                type="number"
                                min="0"
                                .value=${draft.rateLimit}
                                ?disabled=${this.advancedLoading}
                                @input=${(e: Event) =>
                                  this.setChannelDraftValue(
                                    channelId,
                                    "rateLimit",
                                    (e.target as HTMLInputElement).value,
                                  )}
                                placeholder="rateLimit (msgs/min)"
                              />
                              <input
                                class="form-input"
                                type="number"
                                min="1"
                                .value=${draft.maxMediaBytes}
                                ?disabled=${this.advancedLoading}
                                @input=${(e: Event) =>
                                  this.setChannelDraftValue(
                                    channelId,
                                    "maxMediaBytes",
                                    (e.target as HTMLInputElement).value,
                                  )}
                                placeholder="maxMediaBytes"
                              />
                            </div>
                            <div style="display:flex; justify-content:flex-end; margin-top:8px;">
                              <button
                                class="btn-key"
                                ?disabled=${this.advancedLoading}
                                @click=${() => this.saveChannelLimits(channelId)}
                              >
                                Save limits
                              </button>
                            </div>
                            <div class="advanced-split" style="margin-top:8px;">
                              <textarea
                                class="advanced-textarea"
                                .value=${draft.allowlist}
                                ?disabled=${this.advancedLoading}
                                @input=${(e: Event) =>
                                  this.setChannelDraftValue(
                                    channelId,
                                    "allowlist",
                                    (e.target as HTMLTextAreaElement).value,
                                  )}
                                placeholder="allowlist IDs (comma-separated)"
                              ></textarea>
                              <textarea
                                class="advanced-textarea"
                                .value=${draft.blocklist}
                                ?disabled=${this.advancedLoading}
                                @input=${(e: Event) =>
                                  this.setChannelDraftValue(
                                    channelId,
                                    "blocklist",
                                    (e.target as HTMLTextAreaElement).value,
                                  )}
                                placeholder="blocklist IDs (comma-separated)"
                              ></textarea>
                            </div>
                            <div style="display:flex; justify-content:flex-end; margin-top:8px;">
                              <button
                                class="btn-key"
                                ?disabled=${this.advancedLoading}
                                @click=${() => this.saveChannelLists(channelId)}
                              >
                                Save lists
                              </button>
                            </div>
                            ${channel.status.error
                              ? html`<div class="advanced-error">${channel.status.error}</div>`
                              : nothing}
                          </div>
                        `;
                      })}
                    </div>
                  `}
            </div>
          `
        : nothing}

      ${matches("gateway", "browser", "voice", "tts", "headless")
        ? html`
            <div class="advanced-section">
              <div class="advanced-section-title">Gateway Toggles</div>
              <div class="advanced-row">
                <div>
                  <div class="advanced-label">Browser mode</div>
                  <div class="advanced-sub">Headful for visible browser, headless for background.</div>
                </div>
                <button
                  class="btn-key"
                  ?disabled=${this.advancedLoading}
                  @click=${() => this.toggleBrowserHeadless(!this.browserHeadless)}
                >
                  ${this.browserHeadless ? "Headless" : "Visible"}
                </button>
              </div>
              <div class="advanced-row">
                <div>
                  <div class="advanced-label">Text-to-Speech</div>
                  <div class="advanced-sub">Enable spoken responses.</div>
                </div>
                <button
                  class="btn-key"
                  ?disabled=${this.advancedLoading}
                  @click=${() => this.toggleVoiceEnabled(!this.tts.enabled)}
                >
                  ${this.tts.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
              <div class="advanced-row">
                <div>
                  <div class="advanced-label">Voice provider</div>
                  <div class="advanced-sub">Active TTS provider in gateway.</div>
                </div>
                <select
                  class="form-select"
                  ?disabled=${this.advancedLoading}
                  @change=${(e: Event) =>
                    this.selectVoiceProvider((e.target as HTMLSelectElement).value)}
                >
                  ${this.tts.providers.map(
                    (provider) => html`<option
                      value=${provider}
                      ?selected=${provider === this.tts.provider}
                    >
                      ${provider}
                    </option>`,
                  )}
                </select>
              </div>
            </div>
          `
        : nothing}

      ${matches("json", "snapshot", "schema")
        ? html`
            <div class="advanced-section">
              <div class="advanced-section-title">Raw Snapshot</div>
              <pre class="advanced-json">${JSON.stringify(snapshot, null, 2)}</pre>
            </div>
          `
        : nothing}

      ${this.advancedError ? html`<div class="advanced-error">${this.advancedError}</div>` : nothing}
      ${this.advancedSuccess
        ? html`<div class="advanced-ok">${this.advancedSuccess}</div>`
        : nothing}
    `;
  }

  private renderGatewaySettings() {
    const desired = this.daemonSettings?.desired;
    const effective = this.daemonSettings?.effective;
    const restartRequired = this.daemonSettings?.restartRequired === true;
    const bindMode = desired?.bindMode ?? "loopback";
    const authMode = desired?.authMode ?? "open";
    const host = desired?.host ?? "127.0.0.1";
    const port = desired?.port ?? 7433;
    const token = desired?.token ?? "";
    const securityPolicy = desired?.securityPolicy ?? "balanced";

    return html`
      <div class="runtime-grid">
        <div class="runtime-card">
          <div class="runtime-title">Daemon Bind & Auth</div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Bind mode</div>
              <div class="runtime-sub">Loopback is safest. All exposes to network.</div>
            </div>
            <select
              class="form-select"
              .value=${bindMode}
              ?disabled=${this.daemonLoading}
              @change=${(e: Event) =>
                this.patchDaemonSettings({
                  bindMode: (e.target as HTMLSelectElement).value as DaemonSettingsPatch["bindMode"],
                })}
            >
              <option value="loopback">loopback (127.0.0.1)</option>
              <option value="all">all (0.0.0.0)</option>
              <option value="custom">custom</option>
            </select>
          </div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Host</div>
              <div class="runtime-sub">Used only for custom bind mode.</div>
            </div>
            <input
              class="form-input"
              style="max-width:180px;"
              .value=${host}
              ?disabled=${this.daemonLoading || bindMode !== "custom"}
              @change=${(e: Event) =>
                this.patchDaemonSettings({
                  host: (e.target as HTMLInputElement).value,
                  bindMode: "custom",
                })}
            />
          </div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Port</div>
              <div class="runtime-sub">Daemon API port.</div>
            </div>
            <input
              class="form-input"
              style="max-width:120px;"
              type="number"
              min="1"
              max="65535"
              .value=${String(port)}
              ?disabled=${this.daemonLoading}
              @change=${(e: Event) => {
                const parsed = Number((e.target as HTMLInputElement).value);
                if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535) {
                  this.patchDaemonSettings({ port: Math.floor(parsed) });
                }
              }}
            />
          </div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Auth mode</div>
              <div class="runtime-sub">Token mode requires bearer token for all API calls.</div>
            </div>
            <select
              class="form-select"
              .value=${authMode}
              ?disabled=${this.daemonLoading}
              @change=${(e: Event) =>
                this.patchDaemonSettings({
                  authMode: (e.target as HTMLSelectElement).value as DaemonSettingsPatch["authMode"],
                })}
            >
              <option value="open">open</option>
              <option value="token">token</option>
            </select>
          </div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Token</div>
              <div class="runtime-sub">Stored locally for daemon start profiles.</div>
            </div>
            <input
              class="form-input"
              style="max-width:260px;"
              type="text"
              .value=${token}
              ?disabled=${this.daemonLoading || authMode !== "token"}
              @change=${(e: Event) =>
                this.patchDaemonSettings({
                  authMode: "token",
                  token: (e.target as HTMLInputElement).value.trim(),
                })}
              placeholder="Bearer token"
            />
          </div>
          <div class="runtime-actions">
            <button
              class="btn-key"
              ?disabled=${this.daemonLoading}
              @click=${() => this.patchDaemonSettings({ rotateToken: true })}
            >
              Rotate token
            </button>
          </div>
        </div>

        <div class="runtime-card">
          <div class="runtime-title">Security Policy</div>
          <div class="runtime-row">
            <div>
              <div class="runtime-label">Policy profile</div>
              <div class="runtime-sub">Advisory profile exposed to UI/CLI workflows.</div>
            </div>
            <select
              class="form-select"
              .value=${securityPolicy}
              ?disabled=${this.daemonLoading}
              @change=${(e: Event) =>
                this.patchDaemonSettings({
                  securityPolicy:
                    (e.target as HTMLSelectElement).value as DaemonSettingsPatch["securityPolicy"],
                })}
            >
              <option value="strict">strict</option>
              <option value="balanced">balanced</option>
              <option value="permissive">permissive</option>
            </select>
          </div>
          <div class="runtime-stats">
            <div class="runtime-stat">
              <div class="runtime-stat-label">Effective host</div>
              <div class="runtime-stat-value">${effective?.host ?? "-"}</div>
            </div>
            <div class="runtime-stat">
              <div class="runtime-stat-label">Effective port</div>
              <div class="runtime-stat-value">${effective?.port ?? "-"}</div>
            </div>
            <div class="runtime-stat">
              <div class="runtime-stat-label">Effective auth</div>
              <div class="runtime-stat-value">${effective?.authMode ?? "-"}</div>
            </div>
            <div class="runtime-stat">
              <div class="runtime-stat-label">Token set</div>
              <div class="runtime-stat-value">${effective?.tokenSet ? "yes" : "no"}</div>
            </div>
          </div>
          <div class="config-note">
            Settings file: <code>${this.daemonSettings?.settingsFile ?? "-"}</code>
          </div>
        </div>
      </div>

      ${this.daemonError ? html`<div class="runtime-error">${this.daemonError}</div>` : nothing}
      ${this.daemonSuccess ? html`<div class="advanced-ok">${this.daemonSuccess}</div>` : nothing}
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
        <span class="standalone-badge ${restartRequired ? "warn" : "ok"}">
          ${restartRequired ? "restart required" : "live settings match"}
        </span>
        <button
          class="btn-refresh"
          ?disabled=${this.daemonLoading}
          @click=${() => this.refreshDaemonSettings()}
        >
          ${this.daemonLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    `;
  }

  private renderConfigConsole() {
    const cfg = this.gatewayConfig;
    const daemonHost = String(this.getConfigValue("daemon.host") ?? "127.0.0.1");
    const daemonPort = Number(this.getConfigValue("daemon.port") ?? 7433);
    const daemonSecret = String(this.getConfigValue("daemon.jwtSecret") ?? "");
    const dbUrl = String(this.getConfigValue("database.url") ?? "");
    const sandboxNetwork = String(this.getConfigValue("sandbox.defaultNetwork") ?? "none");
    const sandboxMem = Number(this.getConfigValue("sandbox.memoryMb") ?? 512);
    const sandboxCpus = Number(this.getConfigValue("sandbox.cpus") ?? 1);
    const sandboxTimeout = Number(this.getConfigValue("sandbox.timeoutSeconds") ?? 300);
    const logLevel = String(this.getConfigValue("logging.level") ?? "info");
    const logFormat = String(this.getConfigValue("logging.format") ?? "pretty");

    return html`
      <div class="config-grid">
        <div class="advanced-section">
          <div class="advanced-section-title">Daemon Config</div>
          <div class="advanced-row">
            <div>
              <div class="advanced-label">daemon.host</div>
            </div>
            <input
              class="form-input"
              style="max-width:180px;"
              .value=${daemonHost}
              ?disabled=${this.configLoading}
              @change=${(e: Event) =>
                this.setConfigValue("daemon.host", (e.target as HTMLInputElement).value.trim())}
            />
          </div>
          <div class="advanced-row">
            <div>
              <div class="advanced-label">daemon.port</div>
            </div>
            <input
              class="form-input"
              style="max-width:120px;"
              type="number"
              min="1"
              max="65535"
              .value=${Number.isFinite(daemonPort) ? String(daemonPort) : "7433"}
              ?disabled=${this.configLoading}
              @change=${(e: Event) => {
                const n = Number((e.target as HTMLInputElement).value);
                if (Number.isFinite(n) && n >= 1 && n <= 65535) {
                  this.setConfigValue("daemon.port", Math.floor(n));
                }
              }}
            />
          </div>
          <div class="advanced-row">
            <div>
              <div class="advanced-label">daemon.jwtSecret</div>
            </div>
            <input
              class="form-input config-input-wide"
              type="text"
              .value=${daemonSecret}
              ?disabled=${this.configLoading}
              @change=${(e: Event) =>
                this.setConfigValue("daemon.jwtSecret", (e.target as HTMLInputElement).value)}
            />
          </div>
        </div>

        <div class="advanced-section">
          <div class="advanced-section-title">Database & Logging</div>
          <div class="advanced-row">
            <div><div class="advanced-label">database.url</div></div>
            <input
              class="form-input config-input-wide"
              type="text"
              .value=${dbUrl}
              ?disabled=${this.configLoading}
              @change=${(e: Event) =>
                this.setConfigValue("database.url", (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="advanced-row">
            <div><div class="advanced-label">logging.level</div></div>
            <select
              class="form-select"
              .value=${logLevel}
              ?disabled=${this.configLoading}
              @change=${(e: Event) =>
                this.setConfigValue("logging.level", (e.target as HTMLSelectElement).value)}
            >
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
              <option value="silent">silent</option>
            </select>
          </div>
          <div class="advanced-row">
            <div><div class="advanced-label">logging.format</div></div>
            <select
              class="form-select"
              .value=${logFormat}
              ?disabled=${this.configLoading}
              @change=${(e: Event) =>
                this.setConfigValue("logging.format", (e.target as HTMLSelectElement).value)}
            >
              <option value="pretty">pretty</option>
              <option value="json">json</option>
            </select>
          </div>
        </div>

        <div class="advanced-section">
          <div class="advanced-section-title">Sandbox</div>
          <div class="advanced-row">
            <div><div class="advanced-label">sandbox.defaultNetwork</div></div>
            <select
              class="form-select"
              .value=${sandboxNetwork}
              ?disabled=${this.configLoading}
              @change=${(e: Event) =>
                this.setConfigValue("sandbox.defaultNetwork", (e.target as HTMLSelectElement).value)}
            >
              <option value="none">none</option>
              <option value="restricted">restricted</option>
              <option value="open">open</option>
            </select>
          </div>
          <div class="advanced-row">
            <div><div class="advanced-label">sandbox.memoryMb</div></div>
            <input
              class="form-input"
              style="max-width:120px;"
              type="number"
              min="64"
              .value=${Number.isFinite(sandboxMem) ? String(sandboxMem) : "512"}
              ?disabled=${this.configLoading}
              @change=${(e: Event) => {
                const n = Number((e.target as HTMLInputElement).value);
                if (Number.isFinite(n) && n >= 64) {
                  this.setConfigValue("sandbox.memoryMb", Math.floor(n));
                }
              }}
            />
          </div>
          <div class="advanced-row">
            <div><div class="advanced-label">sandbox.cpus</div></div>
            <input
              class="form-input"
              style="max-width:120px;"
              type="number"
              step="0.5"
              min="0.5"
              .value=${Number.isFinite(sandboxCpus) ? String(sandboxCpus) : "1"}
              ?disabled=${this.configLoading}
              @change=${(e: Event) => {
                const n = Number((e.target as HTMLInputElement).value);
                if (Number.isFinite(n) && n >= 0.5) {
                  this.setConfigValue("sandbox.cpus", n);
                }
              }}
            />
          </div>
          <div class="advanced-row">
            <div><div class="advanced-label">sandbox.timeoutSeconds</div></div>
            <input
              class="form-input"
              style="max-width:120px;"
              type="number"
              min="30"
              .value=${Number.isFinite(sandboxTimeout) ? String(sandboxTimeout) : "300"}
              ?disabled=${this.configLoading}
              @change=${(e: Event) => {
                const n = Number((e.target as HTMLInputElement).value);
                if (Number.isFinite(n) && n >= 30) {
                  this.setConfigValue("sandbox.timeoutSeconds", Math.floor(n));
                }
              }}
            />
          </div>
        </div>

        <div class="advanced-section">
          <div class="advanced-section-title">Raw Config Patch</div>
          <textarea
            class="advanced-textarea"
            style="min-height:220px;"
            .value=${this.configPatchText}
            ?disabled=${this.configLoading}
            @input=${(e: Event) => {
              this.configPatchText = (e.target as HTMLTextAreaElement).value;
            }}
          ></textarea>
          <div class="config-actions">
            <button
              class="btn-key"
              ?disabled=${this.configLoading}
              @click=${() => this.refreshConfigConsole()}
            >
              Refresh
            </button>
            <button
              class="btn-key danger"
              ?disabled=${this.configLoading}
              @click=${() => this.resetConfigToDefault()}
            >
              Reset defaults
            </button>
            <button
              class="btn-key"
              ?disabled=${this.configLoading}
              @click=${() => this.applyRawConfigPatch()}
            >
              Apply patch
            </button>
          </div>
          <div class="config-note">
            Uses gateway RPC: <code>config.get/config.set/config.patch/config.schema</code>.
          </div>
        </div>
      </div>

      ${this.configError ? html`<div class="runtime-error">${this.configError}</div>` : nothing}
      ${this.configSuccess ? html`<div class="advanced-ok">${this.configSuccess}</div>` : nothing}
      ${!cfg ? html`<div class="advanced-sub">No config loaded yet.</div>` : nothing}
    `;
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

    const sections: Array<{
      id: ChatSettings["tab"];
      label: string;
    }> = [
      { id: "runtime", label: "Runtime" },
      { id: "advanced", label: "Advanced" },
      { id: "gateway", label: "Gateway" },
      { id: "config", label: "Config Console" },
      { id: "models", label: "Models" },
      { id: "providers", label: "API Keys" },
      { id: "undo", label: "Undo" },
      { id: "voice", label: "Voice" },
      { id: "browser", label: "Browser" },
    ];

    const renderCurrentTab = () =>
      this.tab === "runtime"
        ? this.renderRuntime()
        : this.tab === "advanced"
          ? this.renderAdvanced()
          : this.tab === "gateway"
            ? this.renderGatewaySettings()
            : this.tab === "config"
              ? this.renderConfigConsole()
              : this.tab === "models"
                ? this.renderModels()
                : this.tab === "providers"
                  ? this.renderProviders()
                  : this.tab === "undo"
                    ? this.renderUndo()
                    : this.tab === "voice"
                      ? this.renderVoice()
                      : this.renderBrowser();

    if (this.standalone) {
      const restartRequired = this.daemonSettings?.restartRequired === true;
      return html`
        <div class="standalone-shell">
          <div class="standalone-nav">
            <div class="standalone-title">Settings Sections</div>
            ${sections.map(
              (section) => html`
                <button
                  class="standalone-tab"
                  ?data-active=${this.tab === section.id}
                  @click=${() => {
                    this.tab = section.id;
                  }}
                >
                  <span>${section.label}</span>
                </button>
              `,
            )}
          </div>

          <div class="standalone-content">
            <div class="standalone-header">
              <div>
                <div class="standalone-header-title">${sections.find((s) => s.id === this.tab)?.label ?? "Settings"}</div>
                <div class="standalone-header-sub">Gateway + runtime + schema configuration console</div>
              </div>
              <span class="standalone-badge ${restartRequired ? "warn" : "ok"}">
                ${restartRequired ? "restart required" : "synced"}
              </span>
            </div>
            <div class="panel-body">
              ${renderCurrentTab()}
            </div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this.emit("close-settings"); }}>
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">Settings</span>
            <button class="btn-close" @click=${() => this.emit("close-settings")}>&times;</button>
          </div>
          <div class="tabs">
            ${sections.map(
              (section) => html`
                <button
                  class="tab"
                  ?data-active=${this.tab === section.id}
                  @click=${() => {
                    this.tab = section.id;
                  }}
                >
                  ${section.label}
                </button>
              `,
            )}
          </div>
          <div class="panel-body">
            ${renderCurrentTab()}
          </div>
        </div>
      </div>
    `;
  }
}
