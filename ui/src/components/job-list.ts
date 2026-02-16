import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, type JobItem, type JobStatus, type AgentItem, type RunItem, type JobHistoryStatus } from "../api/client.js";

@customElement("job-list")
export class JobList extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; box-sizing: border-box; }
    .table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    input, select, textarea {
      padding: 9px 14px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--surface-1);
      color: var(--text-primary);
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
      box-shadow: var(--shadow-sm);
    }
    input::placeholder, textarea::placeholder { color: var(--text-tertiary); }
    input:focus, select:focus, textarea:focus { border-color: var(--mint-strong); box-shadow: 0 0 0 3px var(--accent-glow); }
    textarea { resize: vertical; min-height: 60px; width: 100%; box-sizing: border-box; }
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
    .btn-secondary { background: var(--wash); color: var(--text-secondary); border: 1px solid var(--border-strong); }
    .btn-secondary:hover { background: var(--wash-strong); color: var(--text-primary); }
    .btn-run { background: var(--accent-subtle); color: var(--success); border: 1px solid var(--mint-strong); }
    .btn-run:hover { background: var(--dark); color: #FDFEFD; }
    .btn-view-run {
      padding: 2px 8px; font-size: 10px; font-weight: 500;
      background: transparent; color: var(--text-tertiary); border: 1px solid var(--border-strong);
      border-radius: var(--radius-pill); cursor: pointer; margin-top: 4px; display: inline-block;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .btn-view-run:hover { color: var(--text-primary); border-color: var(--mint-strong); background: var(--wash); }

    /* Scheduler status banner */
    .scheduler-status {
      display: flex; gap: 16px; align-items: center; flex-wrap: wrap;
      padding: 12px 16px; margin-bottom: 16px;
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: var(--radius-md); font-size: 12px;
    }
    .sched-indicator {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    }
    .sched-indicator.active { background: var(--success); box-shadow: 0 0 6px var(--success); }
    .sched-indicator.inactive { background: var(--text-tertiary); }
    .sched-label { font-weight: 600; color: var(--text-primary); }
    .sched-meta { color: var(--text-tertiary); font-family: var(--mono); font-size: 11px; }
    .sched-spacer { flex: 1; }
    .undo-toolbar { display: flex; align-items: center; gap: 8px; }
    .undo-meta {
      font-size: 10px;
      color: var(--text-tertiary);
      font-family: var(--mono);
      background: var(--wash);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-pill);
      padding: 2px 8px;
    }
    .history-feedback {
      margin-bottom: 12px;
      font-size: 12px;
      color: var(--text-secondary);
      background: var(--wash);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
    }

    /* Status bar */
    .status-bar {
      display: flex; gap: 8px; margin-bottom: 16px;
      font-size: 12px; color: var(--text-tertiary); align-items: center; flex-wrap: wrap;
    }
    .status-chip {
      background: var(--wash); padding: 4px 12px;
      border-radius: var(--radius-pill); border: 1px solid var(--border-strong);
    }

    /* Create form */
    .create-form {
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: var(--radius-md); padding: 20px;
      margin-bottom: 16px; box-shadow: var(--shadow-sm);
    }
    .form-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 16px; }
    .form-disclaimer {
      font-size: 11px; color: var(--warning, #b45309); line-height: 1.5;
      background: var(--warning-subtle, rgba(180,83,9,0.06));
      border: 1px solid rgba(180,83,9,0.15);
      border-radius: var(--radius-sm); padding: 8px 12px; margin-bottom: 16px;
    }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-full { grid-column: 1 / -1; }
    .form-group { display: flex; flex-direction: column; gap: 4px; }
    .form-label { font-size: 11px; font-weight: 500; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.4px; }
    .form-hint { font-size: 10px; color: var(--text-tertiary); font-family: var(--mono); }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }

    /* Table */
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
    td { color: var(--text-secondary); vertical-align: top; }
    tr:hover td { background: var(--wash); }

    /* Badges */
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
    .badge-skipped { background: var(--wash); color: var(--text-tertiary); }
    .badge-running { background: rgba(109,40,217,0.08); color: #7c3aed; animation: pulse-bg 2s infinite; }
    @keyframes pulse-bg { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
    .badge-enabled { background: var(--accent-subtle); color: var(--success); }
    .badge-disabled { background: var(--wash); color: var(--text-tertiary); }
    .badge-every { background: rgba(109,40,217,0.08); color: #7c3aed; }
    .badge-at { background: var(--warning-subtle); color: var(--warning); }
    .badge-cron { background: rgba(14,116,144,0.08); color: #0e7490; }
    .badge-run { background: var(--accent-subtle); color: var(--dark); }
    .badge-event { background: var(--wash); color: var(--text-secondary); }

    /* Job name cell */
    .job-name { font-weight: 500; color: var(--text-primary); }
    .job-desc { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }
    .job-agent { font-size: 10px; color: var(--text-tertiary); font-family: var(--mono); margin-top: 2px; }

    /* Status cell */
    .status-detail { font-size: 10px; color: var(--text-tertiary); margin-top: 2px; }
    .status-error { font-size: 10px; color: var(--danger); margin-top: 2px; word-break: break-word; max-width: 200px; }
    .consecutive-errors { font-size: 10px; color: var(--danger); font-family: var(--mono); }

    /* Time cells */
    .time-main { font-family: var(--mono); font-size: 11px; }
    .time-relative { font-size: 10px; color: var(--text-tertiary); margin-top: 1px; }

    /* Actions */
    .actions { display: flex; gap: 6px; }

    .empty { color: var(--text-tertiary); padding: 48px; text-align: center; font-size: 13px; }
    .error { color: var(--danger); font-size: 12px; margin-bottom: 12px; word-break: break-word;
      background: var(--danger-subtle); padding: 8px 12px; border-radius: var(--radius-sm);
      border: 1px solid rgba(192,57,43,0.15);
    }

    /* Run history panel */
    .history-row td { padding: 0 12px 12px; background: var(--wash); }
    .history-panel {
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm); padding: 12px; font-size: 11px;
    }
    .history-title {
      font-weight: 600; font-size: 11px; color: var(--text-tertiary);
      text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px;
    }
    .history-empty { color: var(--text-tertiary); font-style: italic; }
    .history-item {
      display: flex; align-items: center; gap: 10px; padding: 6px 0;
      border-bottom: 1px solid var(--border-divider); cursor: pointer;
      transition: background 100ms ease;
    }
    .history-item:last-child { border-bottom: none; }
    .history-item:hover { background: var(--wash); margin: 0 -8px; padding: 6px 8px; border-radius: 4px; }
    .history-time { font-family: var(--mono); color: var(--text-tertiary); min-width: 130px; }
    .history-instruction {
      flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: var(--text-secondary);
    }
    .history-context {
      font-size: 10px; color: var(--text-tertiary); margin-top: 4px;
      padding: 6px 8px; background: var(--wash); border-radius: 4px;
      font-family: var(--mono);
    }
    .btn-history {
      padding: 2px 8px; font-size: 10px; font-weight: 500;
      background: transparent; color: var(--text-tertiary); border: 1px solid var(--border-strong);
      border-radius: var(--radius-pill); cursor: pointer; margin-top: 4px; display: inline-block;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .btn-history:hover { color: var(--text-primary); border-color: var(--mint-strong); background: var(--wash); }

    @media (max-width: 640px) {
      .form-grid { grid-template-columns: 1fr; }
      table { min-width: 800px; }
      .status-bar { flex-wrap: wrap; }
      .scheduler-status { flex-direction: column; align-items: flex-start; gap: 8px; }
    }
  `;

  @state() private jobs: JobItem[] = [];
  @state() private agents: AgentItem[] = [];
  @state() private schedulerStatus: JobStatus | null = null;
  @state() private error = "";
  @state() private showCreate = false;
  @state() private refreshTimer: ReturnType<typeof setInterval> | null = null;
  @state() private selectedRunId: string | null = null;
  @state() private expandedJobId: string | null = null;
  @state() private jobRunsCache = new Map<string, RunItem[]>();
  @state() private historyStatus: JobHistoryStatus = { undoCount: 0, redoCount: 0 };
  @state() private historyBusy = false;
  @state() private historyMessage = "";

  // Create form state
  @state() private newName = "";
  @state() private newDescription = "";
  @state() private newPayload = "";
  @state() private newPayloadKind: "run" | "event" = "run";
  @state() private scheduleKind: "every" | "cron" | "at" = "every";
  @state() private newInterval = "60";
  @state() private newCron = "*/5 * * * *";
  @state() private newCronTz = "";
  @state() private newAt = "";
  @state() private newAgentId = "";
  @state() private newDeleteAfterRun = false;

  connectedCallback() {
    super.connectedCallback();
    try {
      const fromSwarm = sessionStorage.getItem("undoable_selected_run_id");
      if (fromSwarm) {
        this.selectedRunId = fromSwarm;
        sessionStorage.removeItem("undoable_selected_run_id");
      }
    } catch {
      // best effort only
    }
    this.loadAll();
    this.refreshTimer = setInterval(() => this.loadAll(), 15_000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  private async loadAll() {
    await Promise.all([this.loadJobs(), this.loadStatus(), this.loadAgents(), this.loadHistoryStatus()]);
  }

  private async loadJobs() {
    try {
      this.jobs = await api.jobs.list();
      this.error = "";
    } catch (e) {
      this.error = String(e);
    }
  }

  private async loadAgents() {
    try { this.agents = await api.agents.list(); } catch { /* ignore */ }
  }

  private async loadStatus() {
    try {
      this.schedulerStatus = await api.jobs.status();
    } catch { /* ignore */ }
  }

  private async loadHistoryStatus() {
    try {
      this.historyStatus = await api.jobs.historyStatus();
    } catch {
      this.historyStatus = { undoCount: 0, redoCount: 0 };
    }
  }

  private async undoJobMutation() {
    if (this.historyBusy || this.historyStatus.undoCount <= 0) return;
    this.historyBusy = true;
    this.historyMessage = "";
    try {
      const res = await api.jobs.undo();
      this.historyStatus = res.status;
      this.historyMessage = `Undid: ${res.result.label}`;
      await this.loadJobs();
      await this.loadStatus();
    } catch (e) {
      this.error = String(e);
    }
    this.historyBusy = false;
  }

  private async redoJobMutation() {
    if (this.historyBusy || this.historyStatus.redoCount <= 0) return;
    this.historyBusy = true;
    this.historyMessage = "";
    try {
      const res = await api.jobs.redo();
      this.historyStatus = res.status;
      this.historyMessage = `Redid: ${res.result.label}`;
      await this.loadJobs();
      await this.loadStatus();
    } catch (e) {
      this.error = String(e);
    }
    this.historyBusy = false;
  }

  private buildSchedule(): Record<string, unknown> {
    if (this.scheduleKind === "cron") {
      const sched: Record<string, unknown> = { kind: "cron", expr: this.newCron };
      if (this.newCronTz.trim()) sched.tz = this.newCronTz.trim();
      return sched;
    }
    if (this.scheduleKind === "at") {
      const atStr = this.newAt ? new Date(this.newAt).toISOString() : new Date(Date.now() + 60_000).toISOString();
      return { kind: "at", at: atStr };
    }
    return { kind: "every", everyMs: Number(this.newInterval) * 1000 };
  }

  private buildPayload(): Record<string, unknown> {
    if (this.newPayloadKind === "event") {
      return { kind: "event", text: this.newPayload.trim() };
    }
    const payload: Record<string, unknown> = { kind: "run", instruction: this.newPayload.trim() };
    if (this.newAgentId.trim()) payload.agentId = this.newAgentId.trim();
    return payload;
  }

  private async createJob() {
    if (!this.newName.trim() || !this.newPayload.trim()) return;
    try {
      await api.jobs.create({
        name: this.newName.trim(),
        description: this.newDescription.trim() || undefined,
        enabled: true,
        schedule: this.buildSchedule(),
        payload: this.buildPayload(),
        deleteAfterRun: this.newDeleteAfterRun || undefined,
      });
      this.resetForm();
      await this.loadAll();
    } catch (e) {
      this.error = String(e);
    }
  }

  private resetForm() {
    this.newName = "";
    this.newDescription = "";
    this.newPayload = "";
    this.newPayloadKind = "run";
    this.scheduleKind = "every";
    this.newInterval = "60";
    this.newCron = "*/5 * * * *";
    this.newCronTz = "";
    this.newAt = "";
    this.newAgentId = "";
    this.newDeleteAfterRun = false;
    this.showCreate = false;
  }

  private async toggleJob(job: JobItem) {
    try {
      await api.jobs.update(job.id, { enabled: !job.enabled });
      await this.loadAll();
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

  private viewRun(runId: string) {
    this.selectedRunId = runId;
  }

  private backToJobs() {
    this.selectedRunId = null;
  }

  private async toggleHistory(jobId: string) {
    if (this.expandedJobId === jobId) {
      this.expandedJobId = null;
      return;
    }
    this.expandedJobId = jobId;
    try {
      const runs = await api.runs.listByJobId(jobId);
      runs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      this.jobRunsCache = new Map(this.jobRunsCache).set(jobId, runs);
    } catch { /* ignore */ }
  }

  private async deleteJob(job: JobItem) {
    try {
      await api.jobs.remove(job.id);
      await this.loadAll();
    } catch (e) {
      this.error = String(e);
    }
  }

  private fmtTime(ms?: number) {
    if (!ms) return "—";
    return new Date(ms).toLocaleString();
  }

  private fmtRelative(ms?: number): string {
    if (!ms) return "";
    const diff = ms - Date.now();
    const abs = Math.abs(diff);
    const prefix = diff < 0 ? "" : "in ";
    const suffix = diff < 0 ? " ago" : "";
    if (abs < 60_000) return `${prefix}${Math.round(abs / 1000)}s${suffix}`;
    if (abs < 3_600_000) return `${prefix}${Math.round(abs / 60_000)}m${suffix}`;
    if (abs < 86_400_000) return `${prefix}${Math.round(abs / 3_600_000)}h${suffix}`;
    return `${prefix}${Math.round(abs / 86_400_000)}d${suffix}`;
  }

  private fmtDuration(ms?: number): string {
    if (!ms) return "";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}m`;
  }

  private fmtSchedule(job: JobItem): string {
    const s = job.schedule;
    if (s.kind === "every" && s.everyMs) {
      const sec = s.everyMs / 1000;
      if (sec >= 86400 && sec % 86400 === 0) return `every ${sec / 86400}d`;
      if (sec >= 3600 && sec % 3600 === 0) return `every ${sec / 3600}h`;
      if (sec >= 60 && sec % 60 === 0) return `every ${sec / 60}m`;
      return `every ${sec}s`;
    }
    if (s.kind === "at" && s.at) return new Date(s.at).toLocaleString();
    if (s.kind === "cron" && s.expr) return `${s.expr}${s.tz ? ` (${s.tz})` : ""}`;
    return s.kind;
  }

  private renderSchedulerStatus() {
    const st = this.schedulerStatus;
    if (!st) return nothing;
    const nextWake = st.nextWakeAtMs ? this.fmtRelative(st.nextWakeAtMs) : "idle";
    return html`
      <div class="scheduler-status">
        <span class="sched-indicator ${st.enabled ? "active" : "inactive"}"></span>
        <span class="sched-label">Scheduler ${st.enabled ? "Active" : "Disabled"}</span>
        <span class="sched-meta">${st.jobCount} jobs</span>
        <span class="sched-meta">Next wake: ${nextWake}</span>
        <span class="sched-spacer"></span>
        <div class="undo-toolbar">
          <span class="undo-meta">undo ${this.historyStatus.undoCount}</span>
          <span class="undo-meta">redo ${this.historyStatus.redoCount}</span>
          <button class="btn-secondary btn-small" @click=${this.undoJobMutation} ?disabled=${this.historyBusy || this.historyStatus.undoCount <= 0}>Undo</button>
          <button class="btn-secondary btn-small" @click=${this.redoJobMutation} ?disabled=${this.historyBusy || this.historyStatus.redoCount <= 0}>Redo</button>
        </div>
        <button class="btn-primary btn-small" @click=${() => { this.showCreate = !this.showCreate; }}>+ New Job</button>
      </div>
    `;
  }

  private renderCreateForm() {
    if (!this.showCreate) return nothing;
    return html`
      <div class="create-form">
        <h3 class="form-title">Create Scheduled Job</h3>
        <div class="form-disclaimer">
          Scheduled jobs run autonomously — the AI will execute tools (file writes, commands, web requests)
          without confirmation. Review your instruction carefully before creating.
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input placeholder="e.g. Daily backup" .value=${this.newName}
              @input=${(e: Event) => this.newName = (e.target as HTMLInputElement).value}>
          </div>
          <div class="form-group">
            <label class="form-label">Schedule Type</label>
            <select .value=${this.scheduleKind}
              @change=${(e: Event) => this.scheduleKind = (e.target as HTMLSelectElement).value as "every" | "cron" | "at"}>
              <option value="every">Interval</option>
              <option value="cron">Cron Expression</option>
              <option value="at">One-time</option>
            </select>
          </div>

          <div class="form-group form-full">
            <label class="form-label">Description (optional)</label>
            <input placeholder="Brief description of what this job does" .value=${this.newDescription}
              @input=${(e: Event) => this.newDescription = (e.target as HTMLInputElement).value}>
          </div>

          ${this.scheduleKind === "every" ? html`
            <div class="form-group">
              <label class="form-label">Interval (seconds)</label>
              <input type="number" min="1" placeholder="60" .value=${this.newInterval}
                @input=${(e: Event) => this.newInterval = (e.target as HTMLInputElement).value}>
              <span class="form-hint">${this.newInterval ? this.fmtIntervalPreview(Number(this.newInterval)) : ""}</span>
            </div>
          ` : this.scheduleKind === "cron" ? html`
            <div class="form-group">
              <label class="form-label">Cron Expression</label>
              <input placeholder="*/5 * * * *" .value=${this.newCron}
                @input=${(e: Event) => this.newCron = (e.target as HTMLInputElement).value}>
              <span class="form-hint">min hour day month dow</span>
            </div>
            <div class="form-group">
              <label class="form-label">Timezone (optional)</label>
              <input placeholder="e.g. America/New_York" .value=${this.newCronTz}
                @input=${(e: Event) => this.newCronTz = (e.target as HTMLInputElement).value}>
              <span class="form-hint">IANA timezone, defaults to system</span>
            </div>
          ` : html`
            <div class="form-group">
              <label class="form-label">Run At</label>
              <input type="datetime-local" .value=${this.newAt}
                @input=${(e: Event) => this.newAt = (e.target as HTMLInputElement).value}>
            </div>
          `}

          ${this.scheduleKind !== "every" && this.scheduleKind !== "cron" ? html`<div></div>` : nothing}

          <div class="form-group">
            <label class="form-label">Payload Type</label>
            <select .value=${this.newPayloadKind}
              @change=${(e: Event) => this.newPayloadKind = (e.target as HTMLSelectElement).value as "run" | "event"}>
              <option value="run">Agent Run</option>
              <option value="event">System Event</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Agent</label>
            <select .value=${this.newAgentId}
              @change=${(e: Event) => this.newAgentId = (e.target as HTMLSelectElement).value}
              ?disabled=${this.newPayloadKind === "event"}>
              <option value="">Default agent</option>
              ${this.agents.map(a => html`<option value=${a.id}>${a.name || a.id}</option>`)}
            </select>
            <span class="form-hint">Uses default agent if none selected</span>
          </div>

          <div class="form-group form-full">
            <label class="form-label">${this.newPayloadKind === "run" ? "Instruction" : "Event Text"}</label>
            <textarea placeholder=${this.newPayloadKind === "run" ? "Instruction for the agent to execute" : "System event text"}
              .value=${this.newPayload}
              @input=${(e: Event) => this.newPayload = (e.target as HTMLTextAreaElement).value}></textarea>
          </div>

          <div class="form-group form-full">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary)">
              <input
                type="checkbox"
                .checked=${this.newDeleteAfterRun}
                @change=${(e: Event) => { this.newDeleteAfterRun = (e.target as HTMLInputElement).checked; }}
              >
              Delete this job after first successful run
            </label>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn-secondary btn-small" @click=${() => this.resetForm()}>Cancel</button>
          <button class="btn-primary btn-small" @click=${this.createJob}
            ?disabled=${!this.newName.trim() || !this.newPayload.trim()}>Create Job</button>
        </div>
      </div>
    `;
  }

  private fmtIntervalPreview(sec: number): string {
    if (!sec || sec <= 0) return "";
    if (sec >= 86400 && sec % 86400 === 0) return `= every ${sec / 86400} day(s)`;
    if (sec >= 3600 && sec % 3600 === 0) return `= every ${sec / 3600} hour(s)`;
    if (sec >= 60 && sec % 60 === 0) return `= every ${sec / 60} minute(s)`;
    return `= every ${sec} second(s)`;
  }

  private renderJobRow(job: JobItem) {
    const isRunning = typeof job.state.runningAtMs === "number";
    const isExpanded = this.expandedJobId === job.id;
    const runs = this.jobRunsCache.get(job.id) ?? [];
    return html`
      <tr>
        <td>
          <div class="job-name">${job.name}</div>
          ${job.description ? html`<div class="job-desc">${job.description}</div>` : nothing}
          ${job.payload.agentId ? html`<div class="job-agent">agent: ${job.payload.agentId}</div>` : nothing}
          <span class="badge ${job.enabled ? "badge-enabled" : "badge-disabled"}">${job.enabled ? "on" : "off"}</span>
          ${job.deleteAfterRun ? html`<span class="badge badge-at" style="margin-left:4px">auto-delete</span>` : nothing}
        </td>
        <td>
          <span class="badge badge-${job.schedule.kind}">${job.schedule.kind}</span><br>
          <span style="font-family:var(--mono);font-size:11px">${this.fmtSchedule(job)}</span>
        </td>
        <td>
          <span class="badge badge-${job.payload.kind}">${job.payload.kind}</span><br>
          <span style="font-size:11px;max-width:200px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${job.payload.instruction ?? job.payload.text ?? "—"}
          </span>
        </td>
        <td>
          ${isRunning ? html`<span class="badge badge-running">running</span>` :
            job.state.lastStatus
              ? html`<span class="badge badge-${job.state.lastStatus}">${job.state.lastStatus}</span>`
              : "—"}
          ${job.state.lastDurationMs ? html`<div class="status-detail">${this.fmtDuration(job.state.lastDurationMs)}</div>` : nothing}
          ${job.state.lastRunId ? html`<button class="btn-view-run" @click=${() => this.viewRun(job.state.lastRunId!)}>View Run</button>` : nothing}
          <button class="btn-history" @click=${() => this.toggleHistory(job.id)}>
            ${isExpanded ? "Hide History" : "History"}
          </button>
          ${job.state.lastError ? html`<div class="status-error">${job.state.lastError}</div>` : nothing}
          ${(job.state.consecutiveErrors ?? 0) > 1 ? html`<div class="consecutive-errors">${job.state.consecutiveErrors} consecutive errors</div>` : nothing}
        </td>
        <td>
          <div class="time-main">${this.fmtTime(job.state.nextRunAtMs)}</div>
          ${job.state.nextRunAtMs ? html`<div class="time-relative">${this.fmtRelative(job.state.nextRunAtMs)}</div>` : nothing}
        </td>
        <td>
          <div class="time-main">${this.fmtTime(job.state.lastRunAtMs)}</div>
          ${job.state.lastRunAtMs ? html`<div class="time-relative">${this.fmtRelative(job.state.lastRunAtMs)}</div>` : nothing}
        </td>
        <td>
          <div class="actions">
            <button class="btn-run btn-small" @click=${() => this.runJob(job)} ?disabled=${isRunning}>
              ${isRunning ? "..." : "Run"}
            </button>
            <button class="btn-secondary btn-small" @click=${() => this.toggleJob(job)}>
              ${job.enabled ? "Disable" : "Enable"}
            </button>
            <button class="btn-danger btn-small" @click=${() => this.deleteJob(job)}>Del</button>
          </div>
        </td>
      </tr>
      ${isExpanded ? html`
        <tr class="history-row">
          <td colspan="7">
            <div class="history-panel">
              <div class="history-title">Run History</div>
              <div class="history-context">Session: cron-${job.id} (persistent across runs)</div>
              ${runs.length === 0
                ? html`<div class="history-empty">No runs recorded yet</div>`
                : runs.map(r => html`
                  <div class="history-item" @click=${() => this.viewRun(r.id)}>
                    <span class="badge badge-${r.status === "completed" ? "ok" : r.status === "failed" ? "error" : "running"}">${r.status}</span>
                    <span class="history-time">${new Date(r.createdAt).toLocaleString()}</span>
                    <span class="history-instruction">${r.instruction}</span>
                  </div>
                `)}
            </div>
          </td>
        </tr>
      ` : nothing}
    `;
  }

  render() {
    if (this.selectedRunId) {
      return html`<run-detail .runId=${this.selectedRunId} @back=${this.backToJobs}></run-detail>`;
    }

    return html`
      ${this.error ? html`<div class="error">${this.error}</div>` : nothing}
      ${this.historyMessage ? html`<div class="history-feedback">${this.historyMessage}</div>` : nothing}

      ${this.renderSchedulerStatus()}

      ${!this.schedulerStatus ? html`
        <div class="status-bar">
          <span class="status-chip">${this.jobs.length} jobs</span>
          <span class="status-chip">${this.jobs.filter(j => j.enabled).length} enabled</span>
          <span class="status-chip">Undo ${this.historyStatus.undoCount}</span>
          <span class="status-chip">Redo ${this.historyStatus.redoCount}</span>
          <button class="btn-secondary btn-small" @click=${this.undoJobMutation} ?disabled=${this.historyBusy || this.historyStatus.undoCount <= 0}>Undo</button>
          <button class="btn-secondary btn-small" @click=${this.redoJobMutation} ?disabled=${this.historyBusy || this.historyStatus.redoCount <= 0}>Redo</button>
          <span style="margin-left:auto"><button class="btn-primary btn-small" @click=${() => { this.showCreate = !this.showCreate; }}>+ New Job</button></span>
        </div>
      ` : nothing}

      ${this.renderCreateForm()}

      ${this.jobs.length === 0 ? html`
        <div class="empty">
          <div style="font-size:32px;margin-bottom:8px">&#9201;</div>
          No scheduled jobs yet.<br>
          <span style="font-size:11px;color:var(--text-tertiary)">Create a job to run agent instructions on a schedule.</span>
        </div>
      ` : html`
        <div class="table-wrap"><table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Schedule</th>
              <th>Payload</th>
              <th>Status</th>
              <th>Next Run</th>
              <th>Last Run</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.jobs.map(job => this.renderJobRow(job))}
          </tbody>
        </table></div>
      `}
    `;
  }
}
