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

    /* ── Normal mode: checkbox on hover ── */
    .session-check {
      position: absolute; left: 6px; top: 50%; transform: translateY(-50%);
      width: 15px; height: 15px; margin: 0;
      opacity: 0; transition: opacity 100ms ease;
      cursor: pointer; accent-color: var(--mint-strong);
      z-index: 5;
    }
    .session-item:hover .session-check { opacity: 0.35; }
    .session-item:hover .session-check:hover { opacity: 1; }
    .session-check:checked { opacity: 1; }

    /* ── Selection mode: compact rows ── */
    .session-item.selecting {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 8px; border-radius: 6px;
      margin-bottom: 0;
    }
    .session-item.selecting .session-check {
      position: static; transform: none;
      opacity: 1; flex-shrink: 0;
    }
    .session-item.selecting .session-title {
      font-size: 12px; flex: 1; min-width: 0;
    }
    .session-item.selecting .session-meta { display: none; }
    .session-item.selecting .session-preview { display: none; }
    .session-item.selecting .session-time-compact {
      display: block;
      font-size: 10px; color: var(--text-tertiary);
      white-space: nowrap; flex-shrink: 0;
    }
    .session-item.selecting[data-selected] {
      background: var(--accent-subtle);
    }

    .session-time-compact { display: none; }

    /* ── Batch action bar ── */
    .batch-bar {
      padding: 6px 10px;
      border-bottom: 1px solid var(--border-divider);
      display: flex; align-items: center; gap: 6px;
      background: var(--wash);
      flex-shrink: 0;
      animation: slide-down 150ms ease;
    }
    @keyframes slide-down {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .batch-count {
      font-size: 11px; font-weight: 600; color: var(--text-primary);
      flex: 1;
    }
    .batch-btn {
      padding: 4px 10px; border-radius: 6px; border: none;
      font-size: 10px; font-weight: 600; font-family: inherit;
      cursor: pointer; transition: all 120ms ease;
    }
    .batch-btn-cancel {
      background: var(--surface-1); color: var(--text-secondary);
      border: 1px solid var(--border-strong);
    }
    .batch-btn-cancel:hover { background: var(--wash-strong); }
    .batch-btn-delete {
      background: var(--danger); color: #fff;
    }
    .batch-btn-delete:hover { opacity: 0.9; }
    .batch-select-all {
      background: none; border: none; cursor: pointer;
      color: var(--mint-strong); font-size: 10px; font-weight: 600;
      font-family: inherit; padding: 0;
    }
    .batch-select-all:hover { text-decoration: underline; }

    /* ── Confirm dialog ── */
    .dialog-overlay {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      animation: fade-in 120ms ease;
    }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
    .dialog {
      background: var(--surface-1);
      border: 1px solid var(--border-strong);
      border-radius: 14px;
      box-shadow: var(--shadow-raised);
      padding: 20px;
      width: 320px; max-width: 90vw;
      animation: dialog-pop 150ms cubic-bezier(0.2,0.8,0.2,1);
    }
    @keyframes dialog-pop {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    .dialog-title {
      font-size: 15px; font-weight: 600; color: var(--text-primary);
      margin-bottom: 8px;
    }
    .dialog-body {
      font-size: 13px; color: var(--text-secondary);
      line-height: 1.5; margin-bottom: 16px;
    }
    .dialog-actions {
      display: flex; gap: 8px; justify-content: flex-end;
    }
    .dialog-btn {
      padding: 7px 16px; border-radius: 8px; border: none;
      font-size: 12px; font-weight: 600; font-family: inherit;
      cursor: pointer; transition: all 120ms ease;
    }
    .dialog-btn-cancel {
      background: var(--surface-1); color: var(--text-secondary);
      border: 1px solid var(--border-strong);
    }
    .dialog-btn-cancel:hover { background: var(--wash); }
    .dialog-btn-danger {
      background: var(--danger); color: #fff;
    }
    .dialog-btn-danger:hover { opacity: 0.9; }

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
  @state() private contextMenuId = "";
  @state() private renamingId = "";
  @state() private renameValue = "";
  @state() private selectedIds = new Set<string>();
  @state() private showConfirm = false;

  private get selecting(): boolean { return this.selectedIds.size > 0; }

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

  private toggleSelect(e: Event, id: string) {
    e.stopPropagation();
    const next = new Set(this.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds = next;
  }

  private selectAll() {
    this.selectedIds = new Set(this.sessions.map((s) => s.id));
  }

  private cancelSelection() {
    this.selectedIds = new Set();
    this.showConfirm = false;
  }

  private requestBatchDelete() {
    this.showConfirm = true;
  }

  private confirmBatchDelete() {
    this.emit("batch-delete-sessions", Array.from(this.selectedIds));
    this.selectedIds = new Set();
    this.showConfirm = false;
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

  private renderNormalItem(s: SessionItem) {
    return html`
      <div class="session-item" ?data-active=${s.id === this.activeSessionId}
        @click=${() => { if (this.renamingId !== s.id) this.emit("select-session", s.id); }}
        @contextmenu=${(e: Event) => this.openContextMenu(e, s.id)}>
        <input type="checkbox" class="session-check"
          .checked=${this.selectedIds.has(s.id)}
          @click=${(e: Event) => this.toggleSelect(e, s.id)}
          @change=${(e: Event) => e.stopPropagation()}
        />
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
    `;
  }

  private renderSelectItem(s: SessionItem) {
    const checked = this.selectedIds.has(s.id);
    return html`
      <div class="session-item selecting" ?data-selected=${checked}
        @click=${() => { const next = new Set(this.selectedIds); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); this.selectedIds = next; }}>
        <input type="checkbox" class="session-check"
          .checked=${checked}
          @click=${(e: Event) => e.stopPropagation()}
          @change=${(e: Event) => { e.stopPropagation(); const next = new Set(this.selectedIds); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); this.selectedIds = next; }}
        />
        <div class="session-title">${s.title}</div>
        <span class="session-time-compact">${this.fmtTime(s.updatedAt)}</span>
      </div>
    `;
  }

  render() {
    const count = this.selectedIds.size;
    const allSelected = this.sessions.length > 0 && count === this.sessions.length;

    return html`
      <div class="sidebar">
        <div class="sidebar-header">
          <span class="sidebar-logo">Undoable</span>
          <div class="sidebar-spacer"></div>
          <button class="btn-new" @click=${() => this.emit("new-chat")} title="New chat">+</button>
        </div>
        ${count > 0 ? html`
          <div class="batch-bar">
            <span class="batch-count">${count} selected</span>
            ${!allSelected ? html`<button class="batch-select-all" @click=${() => this.selectAll()}>All</button>` : nothing}
            <button class="batch-btn batch-btn-cancel" @click=${() => this.cancelSelection()}>Cancel</button>
            <button class="batch-btn batch-btn-delete" @click=${() => this.requestBatchDelete()}>Delete</button>
          </div>
        ` : nothing}
        <div class="session-list">
          ${this.sessions.length === 0 ? html`<div class="no-sessions">No conversations yet</div>` : nothing}
          ${this.selecting
            ? this.sessions.map((s) => this.renderSelectItem(s))
            : this.sessions.map((s) => this.renderNormalItem(s))}
        </div>
        <div class="nav-footer">
          <button class="nav-item" @click=${() => this.emit("navigate", "agents")} title="Agents">
            <svg class="nav-icon" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "jobs")} title="Jobs">
            <svg class="nav-icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "skills")} title="Skills">
            <svg class="nav-icon" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "channels")} title="Channels">
            <svg class="nav-icon" viewBox="0 0 24 24"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "sessions")} title="Sessions">
            <svg class="nav-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "nodes")} title="Nodes">
            <svg class="nav-icon" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("open-settings")} title="Settings">
            <svg class="nav-icon" viewBox="0 0 24 24"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
          </button>
        </div>
      </div>
      ${this.showConfirm ? html`
        <div class="dialog-overlay" @click=${() => { this.showConfirm = false; }}>
          <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
            <div class="dialog-title">Delete ${count} conversation${count !== 1 ? "s" : ""}?</div>
            <div class="dialog-body">This will permanently delete the selected conversations and all their messages. This action cannot be undone.</div>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn-cancel" @click=${() => { this.showConfirm = false; }}>Cancel</button>
              <button class="dialog-btn dialog-btn-danger" @click=${() => this.confirmBatchDelete()}>Delete</button>
            </div>
          </div>
        </div>
      ` : nothing}
    `;
  }
}
