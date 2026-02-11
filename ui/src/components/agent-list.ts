import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, type AgentItem } from "../api/client.js";

@customElement("agent-list")
export class AgentList extends LitElement {
  static styles = css`
    :host { display: block; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 20px;
    }
    .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .agent-name { font-size: 16px; font-weight: 600; }
    .badge {
      font-size: 11px; padding: 2px 8px; border-radius: 10px;
      background: var(--accent); color: white;
    }
    .detail { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
    .mono { font-family: var(--mono); }
    .empty { text-align: center; padding: 48px; color: var(--text-muted); }
  `;

  @state() private agents: AgentItem[] = [];

  connectedCallback() {
    super.connectedCallback();
    this.loadAgents();
  }

  private async loadAgents() {
    try { this.agents = await api.agents.list(); } catch { this.agents = []; }
  }

  render() {
    if (this.agents.length === 0) return html`<div class="empty">No agents configured</div>`;
    return html`
      <div class="grid">
        ${this.agents.map((a) => html`
          <div class="card">
            <div class="card-header">
              <span class="agent-name">${a.id}</span>
              ${a.default ? html`<span class="badge">default</span>` : ""}
            </div>
            <div class="detail">Model: <span class="mono">${a.model ?? "—"}</span></div>
          </div>
        `)}
      </div>
    `;
  }
}
