import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("undoable-canvas-panel")
export class UndoableCanvasPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      background: var(--surface-1, #f7faf8);
      border: 1px solid var(--border-divider, #dde7e1);
      border-radius: 12px;
      overflow: hidden;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: var(--surface-2, #f2f7f4);
      border-bottom: 1px solid var(--border-divider, #dde7e1);
    }

    .toolbar-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary, #111);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .toolbar-mode {
      font-size: 10px;
      border-radius: 999px;
      padding: 3px 8px;
      border: 1px solid var(--border-strong, #c8d5cd);
      background: var(--surface-1, #fff);
      color: var(--text-secondary, #4c5a53);
      white-space: nowrap;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .toolbar-btn {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: transparent;
      border: none;
      color: var(--text-tertiary, #66736d);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 150ms ease;
    }
    .toolbar-btn:hover {
      background: var(--wash, #eaf0ec);
      color: var(--text-primary, #1e2a24);
    }
    .toolbar-btn svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    .content {
      width: 100%;
      height: calc(100% - 44px);
      position: relative;
    }

    iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: #fff;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-tertiary, #5d6963);
      font-size: 13px;
      gap: 10px;
      padding: 18px;
      box-sizing: border-box;
      text-align: center;
    }
    .empty-state svg {
      width: 32px;
      height: 32px;
      stroke: currentColor;
      stroke-width: 1.5;
      fill: none;
      opacity: 0.5;
    }
    .empty-title {
      font-size: 14px;
      color: var(--text-primary, #1e2a24);
      font-weight: 600;
    }
    .empty-sub {
      max-width: 330px;
      line-height: 1.45;
    }
    .hint {
      font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
      font-size: 11px;
      color: var(--text-secondary, #3f4d47);
      border-radius: 8px;
      border: 1px solid var(--border-divider, #dde7e1);
      background: var(--surface-1, #fff);
      padding: 6px 8px;
    }

    .frames-container {
      width: 100%;
      height: 100%;
      overflow: auto;
      padding: 12px;
      box-sizing: border-box;
      font-family: monospace;
      font-size: 12px;
      color: var(--text-secondary, #4a5751);
      white-space: pre-wrap;
    }
  `;

  @property({ type: String }) url = "";
  @property({ type: String }) defaultUrl = "/__undoable__/canvas/__starter";
  @property({ type: String }) workspaceUrl = "/__undoable__/canvas/?view=workspace";
  @property({ type: Array, attribute: false }) frames: string[] = [];
  @property({ type: Boolean }) visible = true;

  show(opts?: { url?: string }) {
    this.visible = true;
    if (opts?.url) this.url = opts.url;
  }

  hide() {
    this.visible = false;
  }

  navigate(url: string) {
    this.url = url;
    this.visible = true;
  }

  pushFrames(jsonl: string) {
    const lines = jsonl.split("\n").filter((l) => l.trim());
    this.frames = [...this.frames, ...lines];
  }

  resetFrames() {
    this.frames = [];
  }

  private handleClose() {
    this.visible = false;
    this.dispatchEvent(new CustomEvent("canvas-close", { bubbles: true, composed: true }));
  }

  private handleRefresh() {
    if (this.url) {
      const iframe = this.shadowRoot?.querySelector("iframe");
      if (iframe) iframe.src = this.url;
    }
  }

  private handleOpenStarter() {
    this.navigate(this.defaultUrl);
  }

  private handleOpenWorkspace() {
    this.navigate(this.workspaceUrl);
  }

  private modeLabel(): string {
    if (this.url) return "Web";
    if (this.frames.length > 0) return "A2UI";
    return "Ready";
  }

  private titleLabel(): string {
    if (!this.url) return "Live Canvas";
    try {
      const parsed = new URL(this.url, window.location.origin);
      if (parsed.pathname === "/__undoable__/canvas/__starter") return "Live Canvas Starter";
      if (
        parsed.pathname.replace(/\/+$/, "") === "/__undoable__/canvas"
        && parsed.searchParams.get("view") === "workspace"
      ) {
        return "Workspace Root";
      }
    } catch {
      // Fall back to showing the raw value.
    }
    if (this.url === this.defaultUrl) return "Live Canvas Starter";
    if (this.url === this.workspaceUrl) return "Workspace Root";
    return this.url;
  }

  render() {
    if (!this.visible) return html``;

    return html`
      <div class="toolbar">
        <span class="toolbar-title">${this.titleLabel()}</span>
        <span class="toolbar-mode">${this.modeLabel()}</span>
        <button class="toolbar-btn" @click=${this.handleOpenStarter} title="Open starter canvas surface">
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 20h8"/></svg>
        </button>
        <button class="toolbar-btn" @click=${this.handleOpenWorkspace} title="Open workspace root (advanced)">
          <svg viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
        </button>
        <button class="toolbar-btn" @click=${this.handleRefresh} title="Refresh">
          <svg viewBox="0 0 24 24"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
        </button>
        <button class="toolbar-btn" @click=${this.handleClose} title="Close">
          <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="content">
        ${this.url
          ? html`<iframe src=${this.url} sandbox="allow-scripts allow-same-origin allow-forms"></iframe>`
          : this.frames.length > 0
            ? html`<div class="frames-container">${this.frames.join("\n")}</div>`
            : html`
                <div class="empty-state">
                  <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                  <span class="empty-title">Live Canvas workspace</span>
                  <span class="empty-sub">Agent-driven visual surface for previews, dashboards, and A2UI output.</span>
                  <span class="hint">Try: canvas.present | canvas.navigate | canvas.a2ui_push</span>
                </div>
              `
        }
      </div>
    `;
  }
}
