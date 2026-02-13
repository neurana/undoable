import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, type JobItem } from "../api/client.js";

@customElement("job-list")
export class JobList extends LitElement {
  static styles = css`
    :host { display: block; }
    .toolbar { display: flex; gap: 12px; margin-bottom: var(--space-3); align-items: center; }
    input, select {
      padding: 9px 14px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--surface-1);
      color: var(--text-primary);
      font-size: 13px;
      outline: none;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
      box-shadow: var(--shadow-sm);
    }
    input::placeholder { color: var(--text-tertiary); }
    input:focus { border-color: var(--mint-strong); box-shadow: 0 0 0 3px var(--accent-glow); }
    input { flex: 1; }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: var(--radius-pill);
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .btn-primary { background: var(--dark); color: #FDFEFD; }
    .btn-primary:hover { background: var(--accent-hover); box-shadow: 0 4px 12px rgba(46,69,57,0.2); }
    .btn-danger { background: var(--danger-subtle); color: var(--danger); border: 1px solid rgba(192,57,43,0.15); }
    .btn-danger:hover { background: rgba(192,57,43,0.12); }
    .btn-small { padding: 4px 12px; font-size: 11px; }
    .btn-run { background: var(--accent-subtle); color: var(--success); border: 1px solid var(--mint-strong); }
    .btn-run:hover { background: var(--dark); color: #FDFEFD; }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-divider);
      font-size: 12px;
    }
    th {
      color: var(--text-tertiary); font-weight: 500; font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.4px;
    }
    td { color: var(--text-secondary); }
    tr:hover td { background: var(--wash); }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    .badge-ok { background: var(--accent-subtle); color: var(--success); }
    .badge-error { background: var(--danger-subtle); color: var(--danger); }
    .badge-enabled { background: var(--accent-subtle); color: var(--success); }
    .badge-disabled { background: var(--wash); color: var(--text-tertiary); }
    .badge-every { background: rgba(109,40,217,0.08); color: #7c3aed; }
    .badge-at { background: var(--warning-subtle); color: var(--warning); }
    .badge-cron { background: rgba(14,116,144,0.08); color: #0e7490; }
    .empty { color: var(--text-tertiary); padding: 48px; text-align: center; font-size: 13px; }
    .actions { display: flex; gap: 6px; }
    .error { color: var(--danger); font-size: 12px; margin-bottom: 12px; }
    .status-bar {
      display: flex; gap: var(--space-2); margin-bottom: var(--space-2);
      font-size: 12px; color: var(--text-tertiary);
    }
    .status-bar span {
      background: var(--wash); padding: 4px 12px;
      border-radius: var(--radius-pill); border: 1px solid var(--border-strong);
    }
  `;

  @state() private jobs: JobItem[] = [];
  @state() private error = "";
  @state() private newName = "";
  @state() private newInterval = "60";
  @state() private newPayload = "";

  connectedCallback() {
    super.connectedCallback();
    this.loadJobs();
  }

  private async loadJobs() {
    try {
      this.jobs = await api.jobs.list();
      this.error = "";
    } catch (e) {
      this.error = String(e);
    }
  }

  private async createJob() {
    if (!this.newName.trim() || !this.newPayload.trim()) return;
    try {
      await api.jobs.create({
        name: this.newName.trim(),
        enabled: true,
        schedule: { kind: "every", everyMs: Number(this.newInterval) * 1000 },
        payload: { kind: "run", instruction: this.newPayload.trim() },
      });
      this.newName = "";
      this.newPayload = "";
      await this.loadJobs();
    } catch (e) {
      this.error = String(e);
    }
  }

  private async toggleJob(job: JobItem) {
    try {
      await api.jobs.update(job.id, { enabled: !job.enabled });
      await this.loadJobs();
    } catch (e) {
      this.error = String(e);
    }
  }

  private async runJob(job: JobItem) {
    try {
      await api.jobs.run(job.id, true);
      await this.loadJobs();
    } catch (e) {
      this.error = String(e);
    }
  }

  private async deleteJob(job: JobItem) {
    try {
      await api.jobs.remove(job.id);
      await this.loadJobs();
    } catch (e) {
      this.error = String(e);
    }
  }

  private fmtTime(ms?: number) {
    if (!ms) return "—";
    return new Date(ms).toLocaleString();
  }

  private fmtSchedule(job: JobItem) {
    const s = job.schedule;
    if (s.kind === "every" && s.everyMs) return `every ${s.everyMs / 1000}s`;
    if (s.kind === "at" && s.at) return `at ${new Date(s.at).toLocaleString()}`;
    if (s.kind === "cron" && s.expr) return s.expr;
    return s.kind;
  }

  render() {
    return html`
      ${this.error ? html`<div class="error">${this.error}</div>` : ""}

      <div class="status-bar">
        <span>${this.jobs.length} jobs</span>
        <span>${this.jobs.filter(j => j.enabled).length} enabled</span>
      </div>

      <div class="toolbar">
        <input placeholder="Job name" .value=${this.newName} @input=${(e: Event) => this.newName = (e.target as HTMLInputElement).value}>
        <input placeholder="Instruction" .value=${this.newPayload} @input=${(e: Event) => this.newPayload = (e.target as HTMLInputElement).value} style="flex:2">
        <input type="number" placeholder="Interval (sec)" .value=${this.newInterval} @input=${(e: Event) => this.newInterval = (e.target as HTMLInputElement).value} style="width:100px;flex:0">
        <button class="btn-primary" @click=${this.createJob}>Add Job</button>
      </div>

      ${this.jobs.length === 0 ? html`<div class="empty">No scheduled jobs yet</div>` : html`
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Schedule</th>
              <th>Payload</th>
              <th>Status</th>
              <th>Next Run</th>
              <th>Last Run</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.jobs.map(job => html`
              <tr>
                <td>
                  ${job.name}
                  <span class="badge ${job.enabled ? "badge-enabled" : "badge-disabled"}">${job.enabled ? "on" : "off"}</span>
                </td>
                <td><span class="badge badge-${job.schedule.kind}">${this.fmtSchedule(job)}</span></td>
                <td>${job.payload.instruction ?? job.payload.text ?? "—"}</td>
                <td>
                  ${job.state.lastStatus
        ? html`<span class="badge badge-${job.state.lastStatus}">${job.state.lastStatus}</span>`
        : "—"}
                  ${job.state.lastError ? html`<br><small style="color:var(--danger)">${job.state.lastError}</small>` : ""}
                </td>
                <td>${this.fmtTime(job.state.nextRunAtMs)}</td>
                <td>${this.fmtTime(job.state.lastRunAtMs)}</td>
                <td>
                  <div class="actions">
                    <button class="btn-run btn-small" @click=${() => this.runJob(job)}>Run</button>
                    <button class="btn-small" style="background:var(--wash);color:var(--text-secondary);border:1px solid var(--border-strong)" @click=${() => this.toggleJob(job)}>
                      ${job.enabled ? "Disable" : "Enable"}
                    </button>
                    <button class="btn-danger btn-small" @click=${() => this.deleteJob(job)}>Del</button>
                  </div>
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      `}
    `;
  }
}
