import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, type RunItem } from "../api/client.js";

@customElement("run-list")
export class RunList extends LitElement {
  static styles = css`
    :host { display: block; }
    .toolbar { display: flex; gap: 12px; margin-bottom: 20px; }
    input {
      flex: 1; padding: 10px 14px; border-radius: var(--radius);
      border: 1px solid var(--border); background: var(--bg-card);
      color: var(--text); font-size: 14px; outline: none;
    }
    input:focus { border-color: var(--accent); }
    .btn-primary {
      background: var(--accent); color: white; font-weight: 500;
    }
    .btn-primary:hover { background: var(--accent-hover); }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left; padding: 10px 12px; font-size: 12px;
      text-transform: uppercase; color: var(--text-muted);
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 12px; border-bottom: 1px solid var(--border);
      font-size: 14px; cursor: pointer;
    }
    tr:hover td { background: var(--bg-hover); }
    .status {
      display: inline-block; padding: 2px 8px; border-radius: 12px;
      font-size: 12px; font-weight: 500;
    }
    .status-created { background: #1e293b; color: #94a3b8; }
    .status-planning, .status-shadowing { background: #172554; color: #60a5fa; }
    .status-approval_required { background: #422006; color: #fbbf24; }
    .status-applying { background: #14532d; color: #4ade80; }
    .status-completed { background: #052e16; color: #22c55e; }
    .status-failed { background: #450a0a; color: #f87171; }
    .status-cancelled, .status-paused { background: #1c1917; color: #a8a29e; }
    .mono { font-family: var(--mono); font-size: 12px; color: var(--text-muted); }
    .empty { text-align: center; padding: 48px; color: var(--text-muted); }
  `;

  @state() private runs: RunItem[] = [];
  @state() private instruction = "";
  @state() private loading = false;

  connectedCallback() {
    super.connectedCallback();
    this.loadRuns();
  }

  private async loadRuns() {
    try {
      this.runs = await api.runs.list();
    } catch { this.runs = []; }
  }

  private async createRun() {
    if (!this.instruction.trim()) return;
    this.loading = true;
    try {
      await api.runs.create(this.instruction);
      this.instruction = "";
      await this.loadRuns();
    } catch {}
    this.loading = false;
  }

  private selectRun(id: string) {
    this.dispatchEvent(new CustomEvent("select-run", { detail: id, bubbles: true, composed: true }));
  }

  private formatTime(iso: string) {
    return new Date(iso).toLocaleString();
  }

  render() {
    return html`
      <div class="toolbar">
        <input placeholder="Describe a task..." .value=${this.instruction}
          @input=${(e: InputEvent) => this.instruction = (e.target as HTMLInputElement).value}
          @keydown=${(e: KeyboardEvent) => e.key === "Enter" && this.createRun()} />
        <button class="btn-primary" @click=${this.createRun} ?disabled=${this.loading}>
          ${this.loading ? "Creating..." : "New Run"}
        </button>
      </div>
      ${this.runs.length === 0 ? html`<div class="empty">No runs yet</div>` : html`
        <table>
          <thead><tr><th>ID</th><th>Instruction</th><th>Status</th><th>Agent</th><th>Created</th></tr></thead>
          <tbody>
            ${this.runs.map((r) => html`
              <tr @click=${() => this.selectRun(r.id)}>
                <td class="mono">${r.id.slice(0, 8)}</td>
                <td>${r.instruction}</td>
                <td><span class="status status-${r.status}">${r.status}</span></td>
                <td class="mono">${r.agentId}</td>
                <td class="mono">${this.formatTime(r.createdAt)}</td>
              </tr>
            `)}
          </tbody>
        </table>
      `}
    `;
  }
}
