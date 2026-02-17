import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export type TerminalEntry = {
  type: "command" | "output" | "error" | "info";
  content: string;
  timestamp: number;
};

@customElement("terminal-panel")
export class TerminalPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      background: var(--bg-deep);
      border: 1px solid var(--border-divider);
      border-radius: 12px;
      overflow: hidden;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--surface-1);
      border-bottom: 1px solid var(--border-divider);
    }

    .toolbar-dots {
      display: flex;
      gap: 6px;
    }
    .toolbar-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .dot-red { background: var(--danger, #e74c3c); }
    .dot-yellow { background: var(--warning, #f39c12); }
    .dot-green { background: var(--mint); }

    .toolbar-title {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
      flex: 1;
      text-align: center;
      font-family: var(--mono, monospace);
    }

    .toolbar-btn {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: transparent;
      border: none;
      color: var(--text-tertiary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 150ms ease;
    }
    .toolbar-btn:hover {
      background: var(--wash);
      color: var(--text-primary);
    }
    .toolbar-btn svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    .terminal-body {
      height: calc(100% - 88px);
      overflow-y: auto;
      padding: 12px 14px;
      font-family: var(--mono, "SF Mono", "Fira Code", monospace);
      font-size: 12px;
      line-height: 1.6;
      background: var(--bg-base);
    }

    .terminal-entry {
      margin-bottom: 8px;
    }

    .entry-command {
      color: var(--accent-link, #58a6ff);
    }
    .entry-command::before {
      content: "$ ";
      color: var(--mint);
      font-weight: 600;
    }

    .entry-output {
      color: var(--text-primary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .entry-error {
      color: var(--danger, #e74c3c);
      white-space: pre-wrap;
    }

    .entry-info {
      color: var(--text-tertiary);
      font-style: italic;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-tertiary);
      font-size: 13px;
      gap: 12px;
    }
    .empty-state svg {
      width: 40px;
      height: 40px;
      stroke: currentColor;
      stroke-width: 1.5;
      fill: none;
      opacity: 0.5;
    }
    .empty-hint {
      font-size: 11px;
      color: var(--text-tertiary);
      max-width: 200px;
      text-align: center;
      line-height: 1.5;
    }

    .input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: var(--surface-1);
      border-top: 1px solid var(--border-divider);
    }

    .input-prompt {
      color: var(--mint);
      font-family: var(--mono, monospace);
      font-size: 12px;
      font-weight: 600;
    }

    .input-field {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text-primary);
      font-family: var(--mono, "SF Mono", "Fira Code", monospace);
      font-size: 12px;
    }
    .input-field::placeholder {
      color: var(--text-tertiary);
    }

    ::-webkit-scrollbar {
      width: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: var(--border-strong);
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--text-tertiary);
    }
  `;

  @property({ type: Boolean }) visible = true;
  @property({ type: Array, attribute: false }) entries: TerminalEntry[] = [];
  @state() private inputValue = "";

  private scrollToBottom() {
    requestAnimationFrame(() => {
      const body = this.shadowRoot?.querySelector(".terminal-body");
      if (body) body.scrollTop = body.scrollHeight;
    });
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("entries")) this.scrollToBottom();
  }

  addEntry(entry: TerminalEntry) {
    this.entries = [...this.entries, entry];
  }

  clear() {
    this.entries = [];
  }

  private handleClose() {
    this.dispatchEvent(new CustomEvent("terminal-close", { bubbles: true, composed: true }));
  }

  private handleClear() {
    this.clear();
  }

  private handleInputKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && this.inputValue.trim()) {
      const cmd = this.inputValue.trim();
      this.inputValue = "";
      this.dispatchEvent(new CustomEvent("terminal-command", {
        detail: cmd,
        bubbles: true,
        composed: true,
      }));
    }
  }

  render() {
    if (!this.visible) return html``;

    return html`
      <div class="toolbar">
        <div class="toolbar-dots">
          <span class="toolbar-dot dot-red"></span>
          <span class="toolbar-dot dot-yellow"></span>
          <span class="toolbar-dot dot-green"></span>
        </div>
        <span class="toolbar-title">Terminal</span>
        <button class="toolbar-btn" @click=${this.handleClear} title="Clear">
          <svg viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
        <button class="toolbar-btn" @click=${this.handleClose} title="Close">
          <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="terminal-body">
        ${this.entries.length === 0 ? html`
          <div class="empty-state">
            <svg viewBox="0 0 24 24">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="M6 9l4 3-4 3"/>
              <path d="M12 16h6"/>
            </svg>
            <span>CLI Terminal</span>
            <span class="empty-hint">Commands executed by agents will appear here</span>
          </div>
        ` : this.entries.map((entry) => html`
          <div class="terminal-entry">
            ${entry.type === "command" ? html`
              <div class="entry-command">${entry.content}</div>
            ` : entry.type === "error" ? html`
              <div class="entry-error">${entry.content}</div>
            ` : entry.type === "info" ? html`
              <div class="entry-info">${entry.content}</div>
            ` : html`
              <div class="entry-output">${entry.content}</div>
            `}
          </div>
        `)}
      </div>

      <div class="input-row">
        <span class="input-prompt">$</span>
        <input
          class="input-field"
          type="text"
          placeholder="Type a command..."
          .value=${this.inputValue}
          @input=${(e: Event) => { this.inputValue = (e.target as HTMLInputElement).value; }}
          @keydown=${this.handleInputKeyDown}
        />
      </div>
    `;
  }
}
