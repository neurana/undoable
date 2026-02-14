import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, type RunItem } from "../api/client.js";

@customElement("run-list")
export class RunList extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; box-sizing: border-box; }
    .toolbar { display: flex; gap: 12px; margin-bottom: var(--space-3); flex-wrap: wrap; }
    .table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    input {
      flex: 1; padding: 10px 14px; border-radius: var(--radius-sm);
      border: 1px solid var(--border-strong); background: var(--surface-1);
      color: var(--text-primary); font-size: 13px; outline: none;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
      box-shadow: var(--shadow-sm);
    }
    input::placeholder { color: var(--text-tertiary); }
    input:focus { border-color: var(--mint-strong); box-shadow: 0 0 0 3px var(--accent-glow); }
    .btn-primary {
      background: var(--dark); color: #FDFEFD; font-weight: 600;
      border-radius: var(--radius-pill); padding: 8px 18px;
    }
    .btn-primary:hover { background: var(--accent-hover); box-shadow: 0 4px 12px rgba(46,69,57,0.2); }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left; padding: 10px 12px; font-size: 11px;
      text-transform: uppercase; color: var(--text-tertiary);
      border-bottom: 1px solid var(--border-divider);
      letter-spacing: 0.4px; font-weight: 500;
    }
    td {
      padding: 12px; border-bottom: 1px solid var(--border-divider);
      font-size: 13px; cursor: pointer; color: var(--text-secondary);
      transition: background 120ms ease;
    }
    tr:hover td { background: var(--wash); }
    .status {
      display: inline-block; padding: 2px 10px; border-radius: var(--radius-pill);
      font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
    }
    .status-created { background: var(--wash); color: var(--text-tertiary); }
    .status-planning, .status-shadowing { background: var(--accent-subtle); color: var(--success); }
    .status-approval_required { background: var(--warning-subtle); color: var(--warning); }
    .status-applying { background: var(--accent-subtle); color: var(--success); }
    .status-completed { background: var(--accent-subtle); color: var(--success); }
    .status-failed { background: var(--danger-subtle); color: var(--danger); }
    .status-cancelled, .status-paused { background: var(--wash); color: var(--text-tertiary); }
    .source-scheduled {
      display: inline-block; padding: 2px 8px; border-radius: var(--radius-pill);
      font-size: 10px; font-weight: 600; letter-spacing: 0.3px;
      background: rgba(109,40,217,0.08); color: #7c3aed;
    }
    .source-manual {
      display: inline-block; padding: 2px 8px; border-radius: var(--radius-pill);
      font-size: 10px; font-weight: 600; letter-spacing: 0.3px;
      background: var(--wash); color: var(--text-tertiary);
    }
    .mono { font-family: var(--mono); font-size: 11px; color: var(--text-tertiary); }
    .btn-delete {
      background: none; border: none; color: var(--text-tertiary); cursor: pointer;
      font-size: 16px; padding: 2px 6px; border-radius: 4px;
      transition: all 120ms ease;
    }
    .btn-delete:hover { color: var(--danger); background: var(--danger-subtle); }
    .empty { text-align: center; padding: 48px; color: var(--text-tertiary); font-size: 13px; }

    @media (max-width: 640px) {
      .toolbar { flex-direction: column; }
      .toolbar input { width: 100%; }
      table { min-width: 600px; }
    }
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
      const run = await api.runs.create(this.instruction);
      this.instruction = "";
      this.selectRun(run.id);
    } catch {}
    this.loading = false;
  }

  private async deleteRun(id: string) {
    try {
      await api.runs.delete(id);
      await this.loadRuns();
    } catch {}
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
      ${this.runs.length === 0 ? html`<div class="empty">No runs yet. Runs are created when you or a scheduled job executes a task.</div>` : html`
        <div class="table-wrap"><table>
          <thead><tr><th>ID</th><th>Instruction</th><th>Status</th><th>Source</th><th>Agent</th><th>Created</th><th></th></tr></thead>
          <tbody>
            ${this.runs.map((r) => html`
              <tr @click=${() => this.selectRun(r.id)}>
                <td class="mono">${r.id.slice(0, 8)}</td>
                <td>${r.instruction}</td>
                <td><span class="status status-${r.status}">${r.status}</span></td>
                <td><span class="${r.userId === "scheduler" ? "source-scheduled" : "source-manual"}">${r.userId === "scheduler" ? "scheduled" : "manual"}</span></td>
                <td class="mono">${r.agentId}</td>
                <td class="mono">${this.formatTime(r.createdAt)}</td>
                <td><button class="btn-delete" @click=${(e: Event) => { e.stopPropagation(); this.deleteRun(r.id); }} title="Delete">\u00d7</button></td>
              </tr>
            `)}
          </tbody>
        </table></div>
      `}
    `;
  }
}
