import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  api,
  type GatewayBrowserSnapshotNode,
  type GatewayBrowserTab,
} from "../api/client.js";

type SnapshotSummary = {
  nodes: number;
  interactiveNodes: number;
  maxDepth: number;
};

function summarizeSnapshot(root: GatewayBrowserSnapshotNode | null): SnapshotSummary | null {
  if (!root) return null;
  const interactiveRoles = new Set([
    "button",
    "link",
    "textbox",
    "combobox",
    "checkbox",
    "radio",
    "menuitem",
    "tab",
    "option",
    "switch",
    "slider",
  ]);

  let nodes = 0;
  let interactiveNodes = 0;
  let maxDepth = 0;

  const walk = (node: GatewayBrowserSnapshotNode, depth: number) => {
    nodes += 1;
    maxDepth = Math.max(maxDepth, depth);
    if (interactiveRoles.has(node.role)) {
      interactiveNodes += 1;
    }
    for (const child of node.children ?? []) {
      walk(child, depth + 1);
    }
  };

  walk(root, 1);
  return { nodes, interactiveNodes, maxDepth };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unknown browser error";
}

@customElement("browser-control-panel")
export class BrowserControlPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .shell {
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 12px;
      background: var(--surface-1, #fff);
      padding: 14px;
      display: grid;
      gap: 12px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }

    .title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-primary, #1a1a1a);
    }

    .sub {
      font-size: 11px;
      color: var(--text-secondary, #5e6763);
      margin-top: 2px;
    }

    .status-wrap {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .status {
      border-radius: 999px;
      border: 1px solid transparent;
      padding: 3px 8px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      line-height: 1.2;
    }

    .status.visible {
      color: var(--success, #2e7d56);
      border-color: color-mix(in srgb, var(--success, #2e7d56) 35%, transparent);
      background: color-mix(in srgb, var(--success, #2e7d56) 10%, #fff);
    }

    .status.headless {
      color: var(--warning, #b8860b);
      border-color: color-mix(in srgb, var(--warning, #b8860b) 36%, transparent);
      background: color-mix(in srgb, var(--warning, #b8860b) 12%, #fff);
    }

    .hint {
      font-size: 11px;
      color: var(--text-tertiary, #89938f);
      white-space: nowrap;
    }

    .toolbar,
    .url-row,
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .input {
      min-height: 34px;
      border-radius: 8px;
      border: 1px solid var(--border-strong, #cfd8d4);
      background: var(--surface-1, #fff);
      color: var(--text-primary, #1a1a1a);
      font-size: 12px;
      padding: 7px 10px;
      font-family: inherit;
      flex: 1;
      min-width: 200px;
    }

    .input:focus {
      outline: none;
      border-color: var(--accent, #00d090);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #00d090) 20%, transparent);
    }

    .btn {
      min-height: 32px;
      border-radius: 8px;
      border: 1px solid var(--border-strong, #cfd8d4);
      background: var(--surface-1, #fff);
      color: var(--text-primary, #1a1a1a);
      font-size: 11px;
      font-weight: 700;
      padding: 0 10px;
      font-family: inherit;
      cursor: pointer;
      line-height: 1.2;
    }

    .btn:hover {
      background: var(--wash, #eef3f1);
    }

    .btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .btn.primary {
      border-color: color-mix(in srgb, var(--accent, #00d090) 36%, transparent);
      background: color-mix(in srgb, var(--accent, #00d090) 14%, #fff);
      color: var(--accent, #00a16f);
    }

    .tabs {
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 10px;
      overflow: hidden;
    }

    .tab-row {
      display: grid;
      grid-template-columns: 52px minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      padding: 8px;
      border-bottom: 1px solid var(--border-divider, #e0e0e0);
      background: var(--surface-1, #fff);
    }

    .tab-row:last-child {
      border-bottom: none;
    }

    .tab-row[data-active] {
      background: color-mix(in srgb, var(--accent-subtle, #e6f9f1) 55%, #fff);
    }

    .tab-index {
      font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
      font-size: 10px;
      color: var(--text-tertiary, #86908b);
      font-weight: 700;
      white-space: nowrap;
    }

    .tab-body {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    .tab-title {
      font-size: 11px;
      color: var(--text-primary, #1a1a1a);
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tab-url {
      font-size: 10px;
      color: var(--text-secondary, #5f6864);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    }

    .tab-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .tab-btn {
      min-height: 24px;
      border-radius: 999px;
      border: 1px solid var(--border-strong, #cad3cf);
      background: var(--surface-1, #fff);
      color: var(--text-secondary, #4f5753);
      font-size: 10px;
      font-weight: 700;
      padding: 0 9px;
      font-family: inherit;
      cursor: pointer;
    }

    .tab-btn:hover {
      background: var(--wash, #eef3f1);
      color: var(--text-primary, #1a1a1a);
    }

    .tab-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .output {
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 10px;
      background: color-mix(in srgb, var(--surface-1, #fff) 86%, var(--bg-deep, #f6faf8));
      padding: 10px;
      display: grid;
      gap: 8px;
    }

    .output-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-secondary, #5d6662);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .output-text {
      font-size: 11px;
      color: var(--text-primary, #1a1a1a);
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 180px;
      overflow: auto;
      font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    }

    .message {
      border-radius: 8px;
      border: 1px solid transparent;
      padding: 8px 10px;
      font-size: 11px;
      line-height: 1.4;
    }

    .message.ok {
      color: var(--success, #2e7d56);
      border-color: color-mix(in srgb, var(--success, #2e7d56) 24%, transparent);
      background: color-mix(in srgb, var(--success, #2e7d56) 10%, #fff);
    }

    .message.error {
      color: var(--danger, #c0392b);
      border-color: color-mix(in srgb, var(--danger, #c0392b) 26%, transparent);
      background: color-mix(in srgb, var(--danger, #c0392b) 9%, #fff);
    }

    .empty {
      padding: 10px;
      font-size: 11px;
      color: var(--text-secondary, #66706b);
      background: var(--surface-1, #fff);
    }

    @media (max-width: 760px) {
      .tab-row {
        grid-template-columns: 1fr;
      }
      .tab-actions {
        justify-content: flex-start;
      }
      .hint {
        white-space: normal;
      }
    }
  `;

  @property({ type: Boolean }) headless = true;

  @state() private tabs: GatewayBrowserTab[] = [];
  @state() private urlInput = "https://example.com";
  @state() private loading = false;
  @state() private actionLoading = false;
  @state() private infoMessage = "";
  @state() private errorMessage = "";
  @state() private textPreview = "";
  @state() private snapshotSummary: SnapshotSummary | null = null;
  @state() private lastUpdatedAt = 0;

  connectedCallback(): void {
    super.connectedCallback();
    void this.refreshState();
  }

  private emitHeadlessChange(next: boolean): void {
    this.dispatchEvent(
      new CustomEvent<{ headless: boolean }>("browser-headless-change", {
        detail: { headless: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private normalizeUrl(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return "";
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  private clearMessages(): void {
    this.infoMessage = "";
    this.errorMessage = "";
  }

  private async refreshTabs(): Promise<void> {
    const result = await api.gateway.browser.tabs();
    this.tabs = result.tabs ?? [];
  }

  private async refreshState(): Promise<void> {
    this.loading = true;
    this.clearMessages();
    try {
      const [headlessState] = await Promise.all([
        api.gateway.browser.isHeadless(),
        this.refreshTabs(),
      ]);
      if (headlessState.headless !== this.headless) {
        this.headless = headlessState.headless;
        this.emitHeadlessChange(headlessState.headless);
      }
      this.lastUpdatedAt = Date.now();
    } catch (error) {
      this.errorMessage = toErrorMessage(error);
    } finally {
      this.loading = false;
    }
  }

  private async withAction(action: () => Promise<void>): Promise<void> {
    this.actionLoading = true;
    this.clearMessages();
    try {
      await action();
      this.lastUpdatedAt = Date.now();
    } catch (error) {
      this.errorMessage = toErrorMessage(error);
    } finally {
      this.actionLoading = false;
    }
  }

  private async toggleHeadless(): Promise<void> {
    await this.withAction(async () => {
      const next = await api.gateway.browser.setHeadless(!this.headless);
      this.headless = next.headless;
      this.emitHeadlessChange(next.headless);
      await this.refreshTabs();
      this.infoMessage = next.headless
        ? "Browser switched to headless mode."
        : "Browser switched to visible mode.";
    });
  }

  private async navigateActive(): Promise<void> {
    const url = this.normalizeUrl(this.urlInput);
    if (!url) {
      this.errorMessage = "Enter a URL before navigating.";
      return;
    }

    await this.withAction(async () => {
      const result = await api.gateway.browser.navigate(url);
      this.urlInput = url;
      this.infoMessage = result.message;
      await this.refreshTabs();
    });
  }

  private async openNewTab(): Promise<void> {
    const url = this.normalizeUrl(this.urlInput);
    await this.withAction(async () => {
      const result = await api.gateway.browser.openTab(url || undefined);
      this.infoMessage = `Opened tab ${result.tab.index}.`;
      await this.refreshTabs();
    });
  }

  private async focusTab(index: number): Promise<void> {
    await this.withAction(async () => {
      const result = await api.gateway.browser.focusTab(index);
      this.infoMessage = result.message;
      await this.refreshTabs();
    });
  }

  private async closeTab(index: number): Promise<void> {
    await this.withAction(async () => {
      const result = await api.gateway.browser.closeTab(index);
      this.infoMessage = result.message;
      await this.refreshTabs();
    });
  }

  private async readTextPreview(): Promise<void> {
    await this.withAction(async () => {
      const result = await api.gateway.browser.text();
      const normalized = result.text?.trim() ?? "";
      this.textPreview = normalized.length > 4000
        ? `${normalized.slice(0, 4000)}\n\n…truncated`
        : normalized;
      this.infoMessage = this.textPreview.length > 0
        ? "Page text captured."
        : "No readable text found on current page.";
    });
  }

  private async loadSnapshotSummary(): Promise<void> {
    await this.withAction(async () => {
      const result = await api.gateway.browser.snapshot();
      this.snapshotSummary = summarizeSnapshot(result.snapshot);
      this.infoMessage = this.snapshotSummary
        ? "Accessibility snapshot captured."
        : "No snapshot available for current page.";
    });
  }

  private formatTime(ts: number): string {
    if (!ts) return "-";
    return new Date(ts).toLocaleTimeString();
  }

  render() {
    const busy = this.loading || this.actionLoading;

    return html`
      <div class="shell">
        <div class="header">
          <div>
            <div class="title">Browser Control</div>
            <div class="sub">Manage tabs, navigate quickly, and inspect active page content.</div>
          </div>
          <div class="status-wrap">
            <span class="status ${this.headless ? "headless" : "visible"}">
              ${this.headless ? "Headless" : "Visible"}
            </span>
            <span class="hint">Updated ${this.formatTime(this.lastUpdatedAt)}</span>
          </div>
        </div>

        <div class="toolbar">
          <button class="btn" ?disabled=${busy} @click=${() => this.toggleHeadless()}>
            ${this.headless ? "Show Browser" : "Hide Browser"}
          </button>
          <button class="btn" ?disabled=${busy} @click=${() => this.refreshState()}>
            ${this.loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div class="url-row">
          <input
            class="input"
            type="text"
            .value=${this.urlInput}
            placeholder="https://example.com"
            ?disabled=${busy}
            @input=${(event: Event) => {
              this.urlInput = (event.target as HTMLInputElement).value;
            }}
          />
          <button class="btn primary" ?disabled=${busy} @click=${() => this.navigateActive()}>
            Navigate Active
          </button>
          <button class="btn" ?disabled=${busy} @click=${() => this.openNewTab()}>
            Open New Tab
          </button>
        </div>

        <div class="tabs">
          ${this.tabs.length === 0
            ? html`<div class="empty">No tabs yet. Navigate or open a new tab to start.</div>`
            : this.tabs.map(
                (tab) => html`
                  <div class="tab-row" ?data-active=${tab.active}>
                    <div class="tab-index">#${tab.index}${tab.active ? " · active" : ""}</div>
                    <div class="tab-body">
                      <div class="tab-title">${tab.title || "Untitled"}</div>
                      <div class="tab-url">${tab.url || "about:blank"}</div>
                    </div>
                    <div class="tab-actions">
                      ${tab.active
                        ? nothing
                        : html`<button class="tab-btn" ?disabled=${busy} @click=${() => this.focusTab(tab.index)}>Focus</button>`}
                      <button class="tab-btn" ?disabled=${busy || this.tabs.length <= 1} @click=${() => this.closeTab(tab.index)}>Close</button>
                    </div>
                  </div>
                `,
              )}
        </div>

        <div class="actions">
          <button class="btn" ?disabled=${busy} @click=${() => this.readTextPreview()}>
            Read Page Text
          </button>
          <button class="btn" ?disabled=${busy} @click=${() => this.loadSnapshotSummary()}>
            Snapshot Summary
          </button>
        </div>

        ${(this.textPreview || this.snapshotSummary)
          ? html`
              <div class="output">
                ${this.textPreview
                  ? html`
                      <div>
                        <div class="output-title">Text Preview</div>
                        <div class="output-text">${this.textPreview}</div>
                      </div>
                    `
                  : nothing}
                ${this.snapshotSummary
                  ? html`
                      <div>
                        <div class="output-title">Snapshot Summary</div>
                        <div class="output-text">nodes=${this.snapshotSummary.nodes}
interactive=${this.snapshotSummary.interactiveNodes}
maxDepth=${this.snapshotSummary.maxDepth}</div>
                      </div>
                    `
                  : nothing}
              </div>
            `
          : nothing}

        ${this.infoMessage ? html`<div class="message ok">${this.infoMessage}</div>` : nothing}
        ${this.errorMessage ? html`<div class="message error">${this.errorMessage}</div>` : nothing}
      </div>
    `;
  }
}
