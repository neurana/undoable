import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { sidebarStyles } from "./chat-styles.js";
import type { SessionItem } from "./chat-types.js";

@customElement("chat-sidebar")
export class ChatSidebar extends LitElement {
  static styles = [sidebarStyles, css`
    :host {
      display: block;
      width: var(--sidebar-w, 260px); flex-shrink: 0;
      transition: margin-left 220ms cubic-bezier(0.2,0.8,0.2,1);
    }
    :host([collapsed]) { margin-left: calc(-1 * var(--sidebar-w, 260px)); }
    .sidebar {
      width: 100%; height: 100%;
      background: var(--bg-deep);
      border-right: 1px solid var(--border-divider);
      display: flex; flex-direction: column;
    }
    .session-item { position: relative; }
    .session-more {
      opacity: 0; background: none; border: none; cursor: pointer;
      color: var(--text-tertiary); padding: 0 2px; margin-left: auto;
      line-height: 1; transition: all 100ms ease;
      display: flex; align-items: center;
    }
    .session-more svg { stroke: currentColor; stroke-width: 1.5; fill: currentColor; }
    .session-item:hover .session-more { opacity: 0.5; }
    .session-more:hover { opacity: 1 !important; color: var(--text-primary); }
    .rename-input {
      width: 100%; padding: 4px 6px; border: 1px solid var(--mint-strong);
      border-radius: 6px; background: var(--surface-1); color: var(--text-primary);
      font-size: 13px; font-family: inherit; outline: none;
      box-sizing: border-box;
    }
    .ctx-menu {
      position: absolute; right: 6px; top: 100%; z-index: 30;
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: 8px; box-shadow: var(--shadow-raised);
      min-width: 140px; padding: 4px; overflow: hidden;
    }
    .ctx-item {
      display: flex; align-items: center; gap: 8px; width: 100%;
      padding: 6px 10px; border: none; background: none;
      color: var(--text-secondary); font-size: 12px; font-family: inherit;
      cursor: pointer; border-radius: 4px; transition: background 120ms ease;
    }
    .ctx-item:hover { background: var(--wash); color: var(--text-primary); }
    .ctx-item svg { stroke: currentColor; stroke-width: 2; fill: none; flex-shrink: 0; }
    .ctx-danger { color: var(--danger); }
    .ctx-danger:hover { background: var(--danger-subtle); color: var(--danger); }
    @media (max-width: 768px) {
      :host {
        position: fixed; left: 0; top: 0; bottom: 0;
        z-index: 10; width: 85vw; max-width: 300px;
        transition: transform 220ms ease;
        transform: translateX(0); margin-left: 0;
      }
      :host([collapsed]) { margin-left: 0; transform: translateX(-100vw); }
    }
  `];

  @property({ type: Boolean, reflect: true }) collapsed = false;
  @property({ type: Array }) sessions: SessionItem[] = [];
  @property({ type: String }) activeSessionId = "";
  @property({ type: Boolean }) canvasOpen = false;
  @state() private contextMenuId = "";
  @state() private renamingId = "";
  @state() private renameValue = "";

  private fmtTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private openContextMenu(e: Event, id: string) {
    e.preventDefault();
    e.stopPropagation();
    this.contextMenuId = this.contextMenuId === id ? "" : id;
  }

  private startRename(id: string, currentTitle: string) {
    this.contextMenuId = "";
    this.renamingId = id;
    this.renameValue = currentTitle;
  }

  private commitRename() {
    if (this.renamingId && this.renameValue.trim()) {
      this.emit("rename-session", { id: this.renamingId, title: this.renameValue.trim() });
    }
    this.renamingId = "";
    this.renameValue = "";
  }

  private cancelRename() {
    this.renamingId = "";
    this.renameValue = "";
  }

  private handleRenameKey(e: KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); this.commitRename(); }
    else if (e.key === "Escape") this.cancelRename();
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("click", this._dismissCtx);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("click", this._dismissCtx);
  }

  private _dismissCtx = () => { if (this.contextMenuId) this.contextMenuId = ""; };

  render() {
    return html`
      <div class="sidebar">
        <div class="sidebar-header">
          <span class="sidebar-logo">Undoable</span>
          <div class="sidebar-spacer"></div>
          <button class="btn-new" @click=${() => this.emit("new-chat")} title="New chat">+</button>
        </div>
        <div class="session-list">
          ${this.sessions.length === 0 ? html`<div class="no-sessions">No conversations yet</div>` : nothing}
          ${this.sessions.map((s) => html`
            <div class="session-item" ?data-active=${s.id === this.activeSessionId}
              @click=${() => { if (this.renamingId !== s.id) this.emit("select-session", s.id); }}
              @contextmenu=${(e: Event) => this.openContextMenu(e, s.id)}>
              ${this.renamingId === s.id ? html`
                <input class="rename-input" .value=${this.renameValue}
                  @input=${(e: InputEvent) => this.renameValue = (e.target as HTMLInputElement).value}
                  @keydown=${this.handleRenameKey}
                  @blur=${() => this.commitRename()}
                  @click=${(e: Event) => e.stopPropagation()}
                />
              ` : html`<div class="session-title">${s.title}</div>`}
              <div class="session-meta">
                <span>${this.fmtTime(s.updatedAt)}</span>
                <span class="session-meta-dot">\u00b7</span>
                <span>${s.messageCount} msg</span>
                <button class="session-more" @click=${(e: Event) => this.openContextMenu(e, s.id)} title="More">
                  <svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                </button>
              </div>
              ${s.preview && this.renamingId !== s.id ? html`<div class="session-preview">${s.preview}</div>` : nothing}
              ${this.contextMenuId === s.id ? html`
                <div class="ctx-menu" @click=${(e: Event) => e.stopPropagation()}>
                  <button class="ctx-item" @click=${() => this.startRename(s.id, s.title)}>
                    <svg viewBox="0 0 24 24" width="12" height="12"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                    Rename
                  </button>
                  <button class="ctx-item" @click=${() => { this.contextMenuId = ""; this.emit("reset-session", s.id); }}>
                    <svg viewBox="0 0 24 24" width="12" height="12"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    Reset
                  </button>
                  <button class="ctx-item ctx-danger" @click=${() => { this.contextMenuId = ""; this.emit("delete-session", s.id); }}>
                    <svg viewBox="0 0 24 24" width="12" height="12"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Delete
                  </button>
                </div>
              ` : nothing}
            </div>
          `)}
        </div>
        <div class="nav-footer">
          <button class="nav-item" @click=${() => this.emit("navigate", "agents")} title="Agents">
            <svg class="nav-icon" viewBox="0 0 24 24"><path d="M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 21a10 10 0 0 1 20 0"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "jobs")} title="Jobs">
            <svg class="nav-icon" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "skills")} title="Skills">
            <svg class="nav-icon" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "channels")} title="Channels">
            <svg class="nav-icon" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "nodes")} title="Nodes">
            <svg class="nav-icon" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "swarm")} title="SWARM">
            <svg class="nav-icon" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="19" r="2"/><path d="M7 11L10 7M14 7L17 11M7 13L10 17M14 17L17 13"/></svg>
          </button>
          <button class="nav-item" ?data-active=${this.canvasOpen} @click=${() => this.emit("toggle-canvas")} title="Canvas">
            <svg class="nav-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("open-settings")} title="Settings">
            <svg class="nav-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </div>
    `;
  }
}
