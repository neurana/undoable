import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  api,
  type GatewayBrowserTab,
} from "../api/client.js";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Browser stream request failed";
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

@customElement("browser-live-panel")
export class BrowserLivePanel extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .shell {
      height: 100%;
      border: 1px solid var(--border-divider, #dde7e1);
      border-radius: 12px;
      background: var(--surface-1, #ffffff);
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    .toolbar {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-divider, #dde7e1);
      background: var(--surface-2, #f2f7f4);
      display: grid;
      gap: 8px;
      flex-shrink: 0;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .title {
      flex: 1;
      min-width: 0;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-primary, #1e2a24);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .badge {
      border-radius: 999px;
      border: 1px solid var(--border-strong, #cbd7d0);
      padding: 2px 8px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.36px;
      text-transform: uppercase;
      color: var(--text-secondary, #4d5a53);
      background: var(--surface-1, #ffffff);
      white-space: nowrap;
    }

    .badge.live {
      color: var(--success, #2e7d56);
      border-color: color-mix(in srgb, var(--success, #2e7d56) 35%, transparent);
      background: color-mix(in srgb, var(--success, #2e7d56) 10%, #fff);
    }

    .badge.paused {
      color: var(--warning, #b8860b);
      border-color: color-mix(in srgb, var(--warning, #b8860b) 35%, transparent);
      background: color-mix(in srgb, var(--warning, #b8860b) 10%, #fff);
    }

    .badge.headless {
      color: var(--warning, #b8860b);
      border-color: color-mix(in srgb, var(--warning, #b8860b) 35%, transparent);
      background: color-mix(in srgb, var(--warning, #b8860b) 10%, #fff);
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .btn {
      height: 30px;
      border-radius: 8px;
      border: 1px solid var(--border-strong, #cbd7d0);
      background: var(--surface-1, #ffffff);
      color: var(--text-secondary, #4d5a53);
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      padding: 0 10px;
      cursor: pointer;
      transition: all 140ms ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .btn:hover {
      background: var(--wash, #eaf0ec);
      color: var(--text-primary, #1e2a24);
    }

    .btn:disabled {
      opacity: 0.56;
      cursor: not-allowed;
    }

    .btn.primary {
      border-color: color-mix(in srgb, var(--mint-strong, #99dbb5) 60%, transparent);
      background: color-mix(in srgb, var(--accent-subtle, #e5f6ed) 88%, #fff);
      color: var(--dark, #2e4539);
    }

    .btn.icon {
      width: 30px;
      justify-content: center;
      padding: 0;
    }

    .btn svg {
      width: 13px;
      height: 13px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    .url-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .tabs-row {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      padding: 2px 0 2px 0;
      scrollbar-width: thin;
    }

    .tabs-empty {
      font-size: 10px;
      color: var(--text-tertiary, #7d8883);
      padding: 4px 0;
    }

    .tab-chip {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      flex-shrink: 0;
      border: 1px solid var(--border-strong, #cbd7d0);
      border-radius: 8px;
      background: var(--surface-1, #ffffff);
      max-width: 240px;
      overflow: hidden;
    }

    .tab-chip.active {
      border-color: var(--mint-strong, #99dbb5);
      background: color-mix(in srgb, var(--accent-subtle, #e5f6ed) 70%, #fff);
    }

    .tab-main {
      border: none;
      background: transparent;
      color: var(--text-secondary, #4d5a53);
      font: inherit;
      font-size: 10px;
      font-weight: 600;
      height: 28px;
      min-width: 0;
      max-width: 210px;
      padding: 0 8px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }

    .tab-main:hover {
      background: var(--wash, #eaf0ec);
      color: var(--text-primary, #1e2a24);
    }

    .tab-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-tertiary, #7d8883);
      flex-shrink: 0;
      opacity: 0.7;
    }

    .tab-chip.active .tab-dot {
      background: var(--success, #2e7d56);
      opacity: 1;
    }

    .tab-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tab-close {
      border: none;
      border-left: 1px solid var(--border-divider, #dde7e1);
      background: transparent;
      color: var(--text-tertiary, #7d8883);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      width: 26px;
      height: 28px;
      cursor: pointer;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    .tab-close:hover {
      background: color-mix(in srgb, var(--danger, #c0392b) 8%, #fff);
      color: var(--danger, #c0392b);
    }

    .tab-close:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .url-input {
      flex: 1;
      min-width: 0;
      height: 32px;
      border-radius: 8px;
      border: 1px solid var(--border-strong, #cbd7d0);
      background: var(--surface-1, #ffffff);
      color: var(--text-primary, #1e2a24);
      font: inherit;
      font-size: 12px;
      padding: 0 10px;
    }

    .url-input:focus {
      outline: none;
      border-color: var(--mint-strong, #99dbb5);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--mint-strong, #99dbb5) 28%, transparent);
    }

    .viewport {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: var(--bg-base, #f6faf8);
    }

    .frame-wrap {
      position: relative;
      flex: 1;
      min-height: 0;
      border-top: 1px solid var(--border-divider, #dde7e1);
      background:
        radial-gradient(ellipse at top left, rgba(46, 69, 57, 0.08), transparent 52%),
        radial-gradient(ellipse at bottom right, rgba(46, 69, 57, 0.06), transparent 48%),
        #f2f7f4;
      overflow: hidden;
    }

    .frame {
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
      display: block;
      image-rendering: auto;
    }

    .placeholder {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 22px;
      text-align: center;
      color: var(--text-secondary, #5f6e67);
      font-size: 12px;
      line-height: 1.45;
    }

    .meta {
      padding: 8px 12px;
      border-top: 1px solid var(--border-divider, #dde7e1);
      background: var(--surface-1, #ffffff);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 10px;
      color: var(--text-tertiary, #7d8883);
      flex-wrap: wrap;
    }

    .meta-left {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .meta-url {
      max-width: min(420px, 70vw);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
      color: var(--text-secondary, #50605a);
    }

    .error {
      margin-top: 2px;
      border-radius: 8px;
      border: 1px solid color-mix(in srgb, var(--danger, #c0392b) 30%, transparent);
      background: color-mix(in srgb, var(--danger, #c0392b) 8%, #fff);
      color: var(--danger, #c0392b);
      padding: 7px 9px;
      font-size: 11px;
      line-height: 1.4;
    }
  `;

  @property({ type: Boolean }) visible = false;

  @state() private streamEnabled = true;
  @state() private loadingFrame = false;
  @state() private manualRefreshing = false;
  @state() private switchingMode = false;
  @state() private headless = true;
  @state() private frameDataUrl = "";
  @state() private frameUpdatedAt = 0;
  @state() private tabs: GatewayBrowserTab[] = [];
  @state() private activeTab: GatewayBrowserTab | null = null;
  @state() private urlInput = "";
  @state() private infoMessage = "";
  @state() private errorMessage = "";

  private streamTimer: number | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    if (this.visible) {
      void this.bootstrapAndStartStream();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopStream();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("visible")) {
      if (this.visible) {
        void this.bootstrapAndStartStream();
      } else {
        this.stopStream();
      }
    }
  }

  private async bootstrapAndStartStream(): Promise<void> {
    this.stopStream();
    await this.bootstrap();
    this.startStream();
  }

  private emitClose(): void {
    this.dispatchEvent(new CustomEvent("browser-close", { bubbles: true, composed: true }));
  }

  private clearMessages(): void {
    this.infoMessage = "";
    this.errorMessage = "";
  }

  private startStream(): void {
    this.stopStream();
    if (!this.streamEnabled) return;
    this.streamTimer = window.setInterval(() => {
      void this.refreshFrame();
    }, 1300);
    void this.refreshFrame();
  }

  private stopStream(): void {
    if (this.streamTimer !== null) {
      window.clearInterval(this.streamTimer);
      this.streamTimer = null;
    }
  }

  private async bootstrap(): Promise<void> {
    this.clearMessages();
    try {
      const [headlessState] = await Promise.all([
        api.gateway.browser.isHeadless(),
        this.refreshTabs(),
      ]);
      this.headless = headlessState.headless;
    } catch (error) {
      this.errorMessage = toErrorMessage(error);
    }
  }

  private async refreshTabs(): Promise<void> {
    const result = await api.gateway.browser.tabs();
    const tabs = result.tabs ?? [];
    this.tabs = tabs;
    const active =
      tabs.find((tab) => tab.active) ??
      (tabs.length > 0 ? tabs[0]! : null);
    this.activeTab = active;
    if (active?.url && (!this.urlInput || this.urlInput === "about:blank")) {
      this.urlInput = active.url;
    }
  }

  private async refreshFrame(force = false): Promise<void> {
    if (!this.visible) return;
    if (this.loadingFrame) return;
    if (this.switchingMode) return;
    if (!this.streamEnabled && !force) return;
    this.loadingFrame = true;
    try {
      let refreshError: unknown | null = null;
      try {
        const frame = await api.gateway.browser.screenshot(false);
        if (frame.imageBase64?.trim()) {
          this.frameDataUrl = `data:image/png;base64,${frame.imageBase64}`;
          this.frameUpdatedAt = Date.now();
        }
      } catch (error) {
        refreshError = error;
      }

      try {
        await this.refreshTabs();
      } catch (error) {
        if (!refreshError) refreshError = error;
      }

      if (refreshError) {
        this.errorMessage = toErrorMessage(refreshError);
      } else if (!force) {
        this.errorMessage = "";
      }
    } finally {
      this.loadingFrame = false;
    }
  }

  private async handleManualRefresh(): Promise<void> {
    if (this.loadingFrame) return;
    this.manualRefreshing = true;
    this.clearMessages();
    try {
      await this.refreshFrame(true);
    } finally {
      this.manualRefreshing = false;
    }
  }

  private formatLastUpdate(): string {
    if (!this.frameUpdatedAt) return "No frame yet";
    return new Date(this.frameUpdatedAt).toLocaleTimeString();
  }

  private async handleNavigate(): Promise<void> {
    const normalized = normalizeUrl(this.urlInput);
    if (!normalized) {
      this.errorMessage = "Enter a URL before navigating.";
      return;
    }

    this.clearMessages();
    try {
      const result = await api.gateway.browser.navigate(normalized);
      this.urlInput = normalized;
      this.infoMessage = result.message;
      await this.refreshTabs();
      await this.refreshFrame(true);
    } catch (error) {
      this.errorMessage = toErrorMessage(error);
    }
  }

  private async handleOpenTab(): Promise<void> {
    const normalized = normalizeUrl(this.urlInput);
    this.clearMessages();
    try {
      const result = await api.gateway.browser.openTab(normalized || undefined);
      this.infoMessage = `Opened tab ${result.tab.index}.`;
      await this.refreshTabs();
      await this.refreshFrame(true);
    } catch (error) {
      this.errorMessage = toErrorMessage(error);
    }
  }

  private async handleFocusTab(index: number): Promise<void> {
    this.clearMessages();
    try {
      await api.gateway.browser.focusTab(index);
      await this.refreshTabs();
      await this.refreshFrame(true);
    } catch (error) {
      this.errorMessage = toErrorMessage(error);
    }
  }

  private async handleCloseTab(index: number): Promise<void> {
    this.clearMessages();
    try {
      await api.gateway.browser.closeTab(index);
      await this.refreshTabs();
      await this.refreshFrame(true);
    } catch (error) {
      this.errorMessage = toErrorMessage(error);
    }
  }

  private async handleToggleHeadless(): Promise<void> {
    if (this.switchingMode) return;
    this.switchingMode = true;
    const shouldResumeStream = this.streamEnabled;
    const requestHeadless = !this.headless;
    this.stopStream();
    this.clearMessages();
    try {
      const next = await api.gateway.browser.setHeadless(requestHeadless);
      this.headless = next.headless;
      if (!requestHeadless && next.headless) {
        this.infoMessage = "Visible mode is unavailable in this environment. Staying in headless mode.";
      } else {
        this.infoMessage = next.headless
          ? "Browser switched to headless mode."
          : "Browser switched to visible mode.";
      }
      await this.refreshTabs();
      await this.refreshFrame(true);
    } catch (error) {
      this.errorMessage = toErrorMessage(error);
    } finally {
      this.switchingMode = false;
      if (shouldResumeStream && this.streamEnabled) {
        this.startStream();
      }
    }
  }

  private handleToggleStream(): void {
    this.streamEnabled = !this.streamEnabled;
    if (this.streamEnabled) {
      this.infoMessage = "Live stream resumed.";
      this.startStream();
    } else {
      this.infoMessage = "Live stream paused.";
      this.stopStream();
    }
  }

  render() {
    if (!this.visible) return html``;

    return html`
      <section class="shell">
        <div class="toolbar">
          <div class="title-row">
            <div class="title">Live Browser Monitor</div>
            <span class="badge ${this.streamEnabled ? "live" : "paused"}">
              ${this.streamEnabled ? "Live" : "Paused"}
            </span>
            <span class="badge ${this.headless ? "headless" : ""}">
              ${this.headless ? "Headless" : "Visible"}
            </span>
            <button class="btn icon" @click=${() => this.emitClose()} title="Close panel">
              <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div class="controls">
            <button class="btn ${this.streamEnabled ? "" : "primary"}" @click=${() => this.handleToggleStream()}>
              ${this.streamEnabled ? "Pause stream" : "Resume stream"}
            </button>
            <button class="btn" ?disabled=${this.loadingFrame || this.manualRefreshing || this.switchingMode} @click=${() => this.handleManualRefresh()}>
              ${this.manualRefreshing ? "Refreshing..." : "Refresh frame"}
            </button>
            <button class="btn" ?disabled=${this.switchingMode} @click=${() => this.handleToggleHeadless()}>
              ${this.switchingMode
                ? "Switching..."
                : this.headless
                  ? "Try visible mode"
                  : "Use headless mode"}
            </button>
          </div>

          <div class="url-row">
            <input
              class="url-input"
              type="text"
              .value=${this.urlInput}
              placeholder="https://example.com"
              @keydown=${(event: KeyboardEvent) => {
                if (event.key === "Enter") void this.handleNavigate();
              }}
              @input=${(event: Event) => {
                this.urlInput = (event.target as HTMLInputElement).value;
              }}
            />
            <button class="btn primary" @click=${() => this.handleNavigate()}>Go</button>
            <button class="btn" @click=${() => this.handleOpenTab()}>New Tab</button>
          </div>

          <div class="tabs-row">
            ${this.tabs.length === 0
              ? html`<div class="tabs-empty">No tabs yet.</div>`
              : this.tabs.map(
                  (tab) => html`
                    <div class="tab-chip ${tab.active ? "active" : ""}" title=${tab.url || "about:blank"}>
                      <button class="tab-main" @click=${() => this.handleFocusTab(tab.index)}>
                        <span class="tab-dot"></span>
                        <span class="tab-title">${tab.title?.trim() || tab.url || `Tab ${tab.index + 1}`}</span>
                      </button>
                      <button
                        class="tab-close"
                        ?disabled=${this.tabs.length <= 1}
                        @click=${(event: Event) => {
                          event.stopPropagation();
                          void this.handleCloseTab(tab.index);
                        }}
                        title="Close tab"
                      >
                        ×
                      </button>
                    </div>
                  `,
                )}
          </div>
          ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : nothing}
        </div>

        <div class="viewport">
          <div class="frame-wrap">
            ${this.frameDataUrl
              ? html`<img class="frame" src=${this.frameDataUrl} alt="Live browser frame" />`
              : html`
                  <div class="placeholder">
                    Browser stream will appear here after the first successful frame capture.
                  </div>
                `}
          </div>

          <div class="meta">
            <div class="meta-left">
              <span>Last frame: ${this.formatLastUpdate()}</span>
              ${this.activeTab?.url
                ? html`<span class="meta-url" title=${this.activeTab.url}>${this.activeTab.url}</span>`
                : nothing}
            </div>
            <span>${this.infoMessage || "\u00A0"}</span>
          </div>
        </div>
      </section>
    `;
  }
}
