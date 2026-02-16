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
      background: var(--bg-base, #111);
      border: 1px solid var(--border-divider, #2a2a2a);
      border-radius: 12px;
      overflow: hidden;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: var(--surface-1, #1a1a1a);
      border-bottom: 1px solid var(--border-divider, #2a2a2a);
    }

    .toolbar-title {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary, #999);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .toolbar-btn {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: transparent;
      border: none;
      color: var(--text-tertiary, #666);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 150ms ease;
    }
    .toolbar-btn:hover {
      background: var(--wash, #1a1a1a);
      color: var(--text-primary, #eee);
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
      color: var(--text-tertiary, #555);
      font-size: 13px;
      gap: 8px;
    }
    .empty-state svg {
      width: 32px;
      height: 32px;
      stroke: currentColor;
      stroke-width: 1.5;
      fill: none;
      opacity: 0.5;
    }

    .frames-container {
      width: 100%;
      height: 100%;
      overflow: auto;
      padding: 12px;
      box-sizing: border-box;
      font-family: monospace;
      font-size: 12px;
      color: var(--text-secondary, #999);
      white-space: pre-wrap;
    }
  `;

  @property({ type: String }) url = "";
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

  render() {
    if (!this.visible) return html``;

    return html`
      <div class="toolbar">
        <span class="toolbar-title">${this.url || "Canvas"}</span>
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
                  <span>Canvas ready</span>
                </div>
              `
        }
      </div>
    `;
  }
}
