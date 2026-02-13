import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
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
            <div class="session-item" ?data-active=${s.id === this.activeSessionId} @click=${() => this.emit("select-session", s.id)}>
              <div class="session-title">${s.title}</div>
              <div class="session-meta">
                <span>${this.fmtTime(s.updatedAt)}</span>
                <span class="session-meta-dot">\u00b7</span>
                <span>${s.messageCount} msg</span>
                <button class="session-delete" @click=${(e: Event) => { e.stopPropagation(); this.emit("delete-session", s.id); }}>\u00d7</button>
              </div>
              ${s.preview ? html`<div class="session-preview">${s.preview}</div>` : nothing}
            </div>
          `)}
        </div>
        <div class="nav-footer">
          <button class="nav-item" @click=${() => this.emit("navigate", "runs")} title="Runs">
            <svg class="nav-icon" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "agents")} title="Agents">
            <svg class="nav-icon" viewBox="0 0 24 24"><path d="M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 21a10 10 0 0 1 20 0"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "users")} title="Users">
            <svg class="nav-icon" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "jobs")} title="Jobs">
            <svg class="nav-icon" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          </button>
          <button class="nav-item" @click=${() => this.emit("navigate", "skills")} title="Skills">
            <svg class="nav-icon" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </button>
        </div>
      </div>
    `;
  }
}
