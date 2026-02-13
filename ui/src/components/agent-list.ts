import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, type AgentItem } from "../api/client.js";

@customElement("agent-list")
export class AgentList extends LitElement {
  static styles = css`
    :host { display: block; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-2); }
    .card {
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: var(--radius-md); padding: var(--space-3);
      box-shadow: var(--shadow-sm);
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .card:hover { border-color: var(--mint-strong); background: var(--bg-deep); box-shadow: var(--shadow-card); }
    .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .agent-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
    .badge {
      font-size: 10px; padding: 2px 8px; border-radius: var(--radius-pill);
      background: var(--accent-subtle); color: var(--success); font-weight: 600;
    }
    .detail { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; }
    .mono { font-family: var(--mono); color: var(--text-secondary); }
    .empty { text-align: center; padding: 48px; color: var(--text-tertiary); font-size: 13px; }
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
