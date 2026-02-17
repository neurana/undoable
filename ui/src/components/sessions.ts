import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, type SessionListItem } from "../api/client.js";

@customElement("session-list")
export class SessionList extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; box-sizing: border-box; }

    .toolbar {
      display: flex; align-items: center; gap: 12px;
      margin-bottom: 16px; flex-wrap: wrap;
    }
    .filter-group {
      display: flex; align-items: center; gap: 6px;
    }
    .filter-label {
      font-size: 12px; color: var(--text-secondary); white-space: nowrap;
    }
    select {
      padding: 6px 10px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--surface-1);
      color: var(--text-primary);
      font-size: 12px; font-family: inherit;
      outline: none; cursor: pointer;
    }
    select:focus { border-color: var(--mint-strong); }

    .toggle-btn {
      padding: 4px 10px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--surface-1);
      color: var(--text-secondary);
      font-size: 11px; font-family: inherit;
      cursor: pointer; transition: all 100ms ease;
    }
    .toggle-btn:hover { border-color: var(--mint-strong); color: var(--text-primary); }
    .toggle-btn.active { background: var(--mint-wash); border-color: var(--mint-strong); color: var(--mint-strong); }

    .cleanup-btn {
      padding: 4px 10px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--surface-1);
      color: var(--text-tertiary);
      font-size: 11px; font-family: inherit;
      cursor: pointer; transition: all 100ms ease;
    }
    .cleanup-btn:hover { border-color: var(--red); color: var(--red); }

    .count {
      font-size: 12px; color: var(--text-tertiary);
      margin-left: auto;
    }

    table {
      width: 100%; border-collapse: collapse;
      font-size: 13px;
    }
    th {
      text-align: left;
      padding: 8px 12px;
      font-size: 11px; font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border-divider);
      white-space: nowrap;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-divider);
      color: var(--text-primary);
      vertical-align: top;
    }
    tr:hover td { background: var(--wash); }
    tr { cursor: pointer; transition: background 100ms ease; }

    .title-cell {
      font-weight: 500;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .preview-cell {
      color: var(--text-secondary);
      max-width: 400px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }
    .meta-cell {
      color: var(--text-secondary);
      white-space: nowrap;
      font-size: 12px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--wash);
      color: var(--text-secondary);
      font-size: 11px; font-weight: 500;
    }
    .badge-type {
      display: inline-block;
      padding: 2px 6px;
      border-radius: var(--radius-pill);
      font-size: 10px; font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      margin-right: 6px;
    }
    .badge-type.cron { background: var(--purple-wash, #f0e6ff); color: var(--purple, #8b5cf6); }
    .badge-type.run { background: var(--blue-wash, #e6f0ff); color: var(--blue, #3b82f6); }
    .badge-type.channel { background: var(--orange-wash, #fff2e6); color: var(--orange, #f59e0b); }

    .expanded {
      background: var(--surface-1);
    }
    .expanded td {
      border-bottom: none;
    }
    .history-row td {
      padding: 0 12px 12px 12px;
      border-bottom: 1px solid var(--border-divider);
    }
    .history-panel {
      background: var(--bg-deep);
      border: 1px solid var(--border-divider);
      border-radius: var(--radius-sm);
      padding: 12px;
      max-height: 400px;
      overflow-y: auto;
    }
    .msg {
      padding: 8px 0;
      border-bottom: 1px solid var(--border-divider);
    }
    .msg:last-child { border-bottom: none; }
    .msg-role {
      font-size: 11px; font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .msg-role.user { color: var(--mint-strong); }
    .msg-role.assistant { color: var(--text-secondary); }
    .msg-content {
      font-size: 13px; color: var(--text-primary);
      white-space: pre-wrap; word-break: break-word;
      line-height: 1.5;
    }
    .history-empty {
      color: var(--text-tertiary); font-size: 13px;
      text-align: center; padding: 20px;
    }
    .history-loading {
      color: var(--text-tertiary); font-size: 13px;
      text-align: center; padding: 16px;
    }

    .loading { text-align: center; padding: 40px; color: var(--text-tertiary); font-size: 14px; }
    .empty { text-align: center; padding: 40px; color: var(--text-tertiary); font-size: 14px; }

    @media (max-width: 640px) {
      th:nth-child(3), td:nth-child(3),
      th:nth-child(4), td:nth-child(4) { display: none; }
      .title-cell { max-width: 180px; }
    }
  `;

  @state() private sessions: SessionListItem[] = [];
  @state() private loading = true;
  @state() private activityFilter = 0;
  @state() private showInternal = false;
  @state() private expandedId = "";
  @state() private historyMessages: Array<{ role: string; content: string }> = [];
  @state() private historyLoading = false;

  private activityOptions = [
    { value: 0, label: "All" },
    { value: 60, label: "Last hour" },
    { value: 1440, label: "Last 24h" },
    { value: 10080, label: "Last 7d" },
  ];

  connectedCallback() {
    super.connectedCallback();
    this.load();
  }

  private async load() {
    this.loading = true;
    try {
      const opts: { active_minutes?: number; include_internal?: boolean } = {};
      if (this.activityFilter > 0) opts.active_minutes = this.activityFilter;
      if (this.showInternal) opts.include_internal = true;
      this.sessions = await api.sessions.list(opts);
    } catch {
      this.sessions = [];
    }
    this.loading = false;
  }

  private sessionType(id: string): string | null {
    if (id.startsWith("cron-")) return "cron";
    if (id.startsWith("run-")) return "run";
    if (id.startsWith("channel-") || id.startsWith("send-")) return "channel";
    if (id.startsWith("agent-")) return "run";
    return null;
  }

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

  private async toggleExpand(id: string) {
    if (this.expandedId === id) {
      this.expandedId = "";
      return;
    }
    this.expandedId = id;
    this.historyMessages = [];
    this.historyLoading = true;
    try {
      const result = await api.sessions.history(id, { limit: 30 });
      this.historyMessages = result.messages as Array<{ role: string; content: string }>;
    } catch {
      this.historyMessages = [];
    }
    this.historyLoading = false;
  }

  private onFilterChange(e: Event) {
    this.activityFilter = Number((e.target as HTMLSelectElement).value);
    this.expandedId = "";
    this.load();
  }

  private toggleInternal() {
    this.showInternal = !this.showInternal;
    this.expandedId = "";
    this.load();
  }

  private async cleanup() {
    try {
      const res = await fetch("/api/sessions/cleanup", { method: "POST" });
      if (res.ok) {
        const data = await res.json() as { removed: number };
        if (data.removed > 0) this.load();
      }
    } catch { }
  }

  render() {
    if (this.loading) return html`<div class="loading">Loading sessions...</div>`;

    return html`
      <div class="toolbar">
        <div class="filter-group">
          <span class="filter-label">Activity:</span>
          <select @change=${this.onFilterChange}>
            ${this.activityOptions.map((o) => html`
              <option value=${o.value} ?selected=${this.activityFilter === o.value}>${o.label}</option>
            `)}
          </select>
        </div>
        <button class="toggle-btn ${this.showInternal ? "active" : ""}" @click=${this.toggleInternal}>
          ${this.showInternal ? "Hide" : "Show"} internal
        </button>
        <button class="cleanup-btn" @click=${this.cleanup}>Cleanup empty</button>
        <span class="count">${this.sessions.length} session${this.sessions.length !== 1 ? "s" : ""}</span>
      </div>

      ${this.sessions.length === 0
        ? html`<div class="empty">No sessions found</div>`
        : html`
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Preview</th>
                <th>Messages</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              ${this.sessions.map((s) => {
                const sType = this.sessionType(s.id);
                return html`
                <tr class=${this.expandedId === s.id ? "expanded" : ""} @click=${() => this.toggleExpand(s.id)}>
                  <td class="title-cell">
                    ${sType ? html`<span class="badge-type ${sType}">${sType}</span>` : nothing}
                    ${s.title || s.id}
                  </td>
                  <td class="preview-cell">${s.preview || "\u2014"}</td>
                  <td class="meta-cell"><span class="badge">${s.messageCount}</span></td>
                  <td class="meta-cell">${this.fmtTime(s.updatedAt)}</td>
                </tr>
                ${this.expandedId === s.id ? html`
                  <tr class="history-row">
                    <td colspan="4">
                      <div class="history-panel">
                        ${this.historyLoading ? html`<div class="history-loading">Loading history...</div>` : nothing}
                        ${!this.historyLoading && this.historyMessages.length === 0
                          ? html`<div class="history-empty">No messages</div>`
                          : nothing}
                        ${this.historyMessages.map((m) => html`
                          <div class="msg">
                            <div class="msg-role ${m.role}">${m.role}</div>
                            <div class="msg-content">${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}</div>
                          </div>
                        `)}
                      </div>
                    </td>
                  </tr>
                ` : nothing}
              `;})}
            </tbody>
          </table>
        `}
    `;
  }
}
