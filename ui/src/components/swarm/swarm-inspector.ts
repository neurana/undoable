import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  RunItem,
  SwarmNodePatchInput,
  SwarmNodeType,
  SwarmOrchestrationNodeStatus,
  SwarmWorkflow,
  SwarmWorkflowNode,
} from "../../api/client.js";
import "./swarm-activity-stream.js";

type RegistrySkillSearchItem = {
  reference: string;
  repo: string;
  skill: string;
  url: string;
  recommended?: boolean;
};

type RegistrySkillSearchResponse = {
  ok: boolean;
  error?: string;
  results?: RegistrySkillSearchItem[];
};

type NodeOrchestrationState = {
  status: SwarmOrchestrationNodeStatus;
  reason?: string;
  runId?: string;
};

@customElement("swarm-inspector")
export class SwarmInspector extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      background:
        radial-gradient(circle at 100% -18%, rgba(174, 231, 199, 0.24), transparent 34%),
        linear-gradient(180deg, rgba(253, 254, 253, 0.98), rgba(246, 250, 248, 0.94));
      min-height: 0;
      min-width: 0;
      height: 100%;
      overflow: hidden;
      border-radius: 0;
      border: none;
    }
    .body {
      padding: 14px;
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1 1 0;
      min-height: 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .body::-webkit-scrollbar { width: 6px; }
    .body::-webkit-scrollbar-track { background: transparent; }
    .body::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
    .panel-head {
      border: 1px solid var(--border-divider);
      border-radius: 14px;
      background:
        linear-gradient(180deg, rgba(253, 254, 253, 0.96), rgba(246, 250, 248, 0.92));
      padding: 12px;
      display: grid;
      gap: 10px;
      flex-shrink: 0;
      min-width: 0;
      overflow: hidden;
      box-shadow: 0 8px 18px rgba(17, 26, 23, 0.06);
      animation: panel-in 220ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .panel-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chip {
      font-size: 10px;
      border-radius: 999px;
      padding: 3px 9px;
      border: 1px solid var(--border-strong);
      background: rgba(253, 254, 253, 0.86);
      color: var(--text-secondary);
      white-space: nowrap;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .chip.live {
      background: color-mix(in srgb, var(--accent-subtle) 85%, transparent);
      color: var(--dark);
      border-color: var(--mint-strong);
    }
    .chip.status-running {
      border-color: var(--mint-strong);
      color: var(--dark);
      background: color-mix(in srgb, var(--accent-subtle) 80%, transparent);
    }
    .chip.status-done {
      border-color: rgba(46, 125, 50, 0.25);
      color: #2e7d32;
      background: rgba(46, 125, 50, 0.08);
    }
    .chip.status-failed {
      border-color: rgba(192, 57, 43, 0.28);
      color: var(--danger);
      background: var(--danger-subtle);
    }
    .chip.status-queued {
      border-color: rgba(23, 103, 158, 0.3);
      color: #17679e;
      background: rgba(23, 103, 158, 0.09);
    }
    .chip.status-blocked {
      border-color: rgba(120, 75, 24, 0.34);
      color: #784b18;
      background: rgba(120, 75, 24, 0.1);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .label {
      font-size: 10px;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .section {
      border: 1px solid var(--border-divider);
      border-radius: 14px;
      padding: 11px;
      background:
        linear-gradient(180deg, rgba(253, 254, 253, 0.95), rgba(246, 250, 248, 0.9));
      display: grid;
      gap: 10px;
      flex-shrink: 0;
      min-width: 0;
      overflow: hidden;
      box-shadow: 0 5px 14px rgba(17, 26, 23, 0.05);
      animation: panel-in 260ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .input, .select, .textarea {
      border: 1px solid var(--border-strong);
      border-radius: 11px;
      background: rgba(253, 254, 253, 0.96);
      color: var(--text-primary);
      font: inherit;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
    }
    .input, .select { height: 34px; padding: 0 11px; }
    .textarea { min-height: 88px; padding: 9px 11px; resize: vertical; }
    .input:focus, .select:focus, .textarea:focus {
      outline: none;
      border-color: var(--mint-strong);
      box-shadow: 0 0 0 3px rgba(171, 204, 186, 0.2);
      background: var(--surface-1);
    }
    .row { display: grid; gap: 7px; min-width: 0; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; min-width: 0; }
    .inline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.45;
    }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .btn {
      height: 34px;
      border: none;
      border-radius: 10px;
      padding: 0 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      background: var(--dark);
      color: #fff;
      transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms ease, opacity 180ms ease;
    }
    .btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 22px rgba(17, 26, 23, 0.14);
    }
    .btn:disabled, .btn-mini:disabled {
      opacity: 0.58;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    .btn-secondary {
      background: rgba(253, 254, 253, 0.82);
      color: var(--text-secondary);
      border: 1px solid var(--border-strong);
    }
    .btn-danger {
      background: var(--danger-subtle);
      color: var(--danger);
      border: 1px solid rgba(192,57,43,0.2);
    }
    .skill-search-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      align-items: center;
    }
    .btn-mini {
      height: 32px;
      border-radius: 10px;
      border: 1px solid var(--border-strong);
      background: rgba(253, 254, 253, 0.88);
      color: var(--text-secondary);
      padding: 0 11px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 160ms ease;
    }
    .btn-mini:hover {
      transform: translateY(-1px);
      box-shadow: 0 7px 14px rgba(17, 26, 23, 0.08);
    }
    .skill-results {
      display: grid;
      gap: 6px;
      max-height: 196px;
      overflow: auto;
    }
    .skill-item {
      border: 1px solid var(--border-divider);
      border-radius: 10px;
      padding: 8px;
      background: rgba(246, 250, 248, 0.92);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .skill-ref {
      font-size: 11px;
      color: var(--text-secondary);
      font-family: var(--mono);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .skill-hint {
      font-size: 11px;
      color: var(--text-tertiary);
      line-height: 1.3;
    }
    .skill-error {
      font-size: 11px;
      color: var(--danger);
    }
    .run {
      border: 1px solid var(--border-divider);
      border-radius: 11px;
      padding: 9px;
      display: grid;
      gap: 8px;
      background: rgba(246, 250, 248, 0.92);
    }
    .run-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }
    .run-id { font-family: var(--mono); color: var(--text-secondary); }
    .run-time { font-size: 11px; color: var(--text-tertiary); }
    .muted { font-size: 12px; color: var(--text-tertiary); }
    .hint { font-size: 11px; color: var(--text-tertiary); line-height: 1.4; }
    .tabs {
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-divider);
      background: rgba(246, 250, 248, 0.92);
      flex-shrink: 0;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .tab {
      padding: 7px 13px;
      border: none;
      background: transparent;
      color: var(--text-tertiary);
      font-size: 12px;
      cursor: pointer;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 180ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .tab:hover {
      transform: translateY(-1px);
      background: var(--wash);
      color: var(--text-secondary);
    }
    .tab.active {
      background: var(--surface-1);
      color: var(--text-primary);
      font-weight: 600;
      box-shadow: 0 6px 14px rgba(17, 26, 23, 0.08);
    }
    .live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--mint-strong);
      animation: blink 1s infinite;
    }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    @keyframes panel-in {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .activity-area {
      flex: 1 1 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .activity-area swarm-activity-stream {
      flex: 1 1 0;
      min-height: 0;
    }
    @media (max-width: 920px) {
      .row2 { grid-template-columns: 1fr; }
      .inline { align-items: flex-start; flex-direction: column; }
      .skill-search-row {
        grid-template-columns: 1fr;
      }
      .actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
      .btn, .btn-mini {
        width: 100%;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .panel-head,
      .section,
      .tab,
      .btn,
      .btn-mini,
      .live-dot {
        animation: none !important;
        transition: none !important;
      }
    }
  `;

  @property({ attribute: false }) workflow: SwarmWorkflow | null = null;
  @property({ attribute: false }) node: SwarmWorkflowNode | null = null;
  @property({ attribute: false }) runs: RunItem[] = [];
  @property({ type: Boolean }) busy = false;
  @property() activeRunId = "";
  @property({ attribute: false }) orchestrationNodeState: NodeOrchestrationState | null = null;
  @state() private activeTab: "config" | "activity" = "config";
  @state() private edgeTarget = "";
  @state() private skillSearchQuery = "find skills";
  @state() private skillSearching = false;
  @state() private skillSearchError = "";
  @state() private skillSearchResults: RegistrySkillSearchItem[] = [];
  @state() private scheduleMode: "manual" | "dependency" | "every" | "at" | "cron" = "manual";
  @state() private scheduleEverySeconds = "60";
  @state() private scheduleAtISO = "";
  @state() private scheduleCronExpr = "0 9 * * *";
  @state() private scheduleTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  protected willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has("node")) {
      this.edgeTarget = "";
      this.skillSearchError = "";
      this.skillSearchResults = [];
      this.skillSearchQuery = "find skills";
      this.hydrateScheduleDraft();
    }
    if (changed.has("activeRunId")) {
      const prev = changed.get("activeRunId") as string | undefined;
      if (this.activeRunId && !prev) this.activeTab = "activity";
      if (!this.activeRunId && prev) this.activeTab = "config";
    }
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private fmtTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  private statusClass(status: string): string {
    if (["created", "planning", "applying", "running"].includes(status)) return "status-running";
    if (["completed", "done", "success"].includes(status)) return "status-done";
    if (["failed", "cancelled", "error"].includes(status)) return "status-failed";
    return "";
  }

  private orchestrationStatusClass(status: SwarmOrchestrationNodeStatus): string {
    if (status === "running") return "status-running";
    if (status === "completed") return "status-done";
    if (status === "failed" || status === "cancelled") return "status-failed";
    if (status === "pending") return "status-queued";
    if (status === "blocked" || status === "skipped") return "status-blocked";
    return "";
  }

  private orchestrationStatusLabel(status: SwarmOrchestrationNodeStatus): string {
    if (status === "pending") return "Queued";
    if (status === "running") return "Running";
    if (status === "completed") return "Completed";
    if (status === "failed") return "Failed";
    if (status === "cancelled") return "Cancelled";
    if (status === "blocked") return "Blocked";
    if (status === "skipped") return "Skipped";
    return status;
  }

  private hydrateScheduleDraft() {
    const schedule = this.node?.schedule;
    if (!schedule) {
      this.scheduleMode = "manual";
      return;
    }

    this.scheduleMode = schedule.mode;
    if (schedule.mode === "every") {
      const seconds = Math.max(1, Math.round((schedule.everyMs ?? 60_000) / 1000));
      this.scheduleEverySeconds = String(seconds);
    } else if (!this.scheduleEverySeconds) {
      this.scheduleEverySeconds = "60";
    }

    if (schedule.mode === "at") {
      this.scheduleAtISO = schedule.at ?? "";
    } else if (!this.scheduleAtISO) {
      this.scheduleAtISO = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    }

    if (schedule.mode === "cron") {
      this.scheduleCronExpr = schedule.expr ?? "0 9 * * *";
      this.scheduleTimezone = schedule.tz ?? this.scheduleTimezone;
    } else if (!this.scheduleCronExpr) {
      this.scheduleCronExpr = "0 9 * * *";
    }
  }

  private scheduleChip(): string {
    if (!this.node) return "manual";
    const schedule = this.node.schedule;
    if (schedule.mode === "every") {
      const seconds = Math.max(1, Math.round((schedule.everyMs ?? 60_000) / 1000));
      return `every ${seconds}s`;
    }
    if (schedule.mode === "at") return `at ${schedule.at}`;
    if (schedule.mode === "cron") return `cron ${schedule.expr}`;
    return schedule.mode;
  }

  private async searchSkillsRegistry() {
    this.skillSearching = true;
    this.skillSearchError = "";
    try {
      const res = await fetch("/api/skills/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: this.skillSearchQuery.trim() || "find skills" }),
      });
      const data = await res.json() as RegistrySkillSearchResponse;
      this.skillSearchResults = data.results?.slice(0, 8) ?? [];
      if (!data.ok) {
        this.skillSearchError = data.error ?? `Search failed (HTTP ${res.status})`;
      }
    } catch (err) {
      this.skillSearchError = String(err);
      this.skillSearchResults = [];
    }
    this.skillSearching = false;
  }

  private addSkillReference(reference: string) {
    const skillsInput = this.renderRoot.querySelector<HTMLInputElement>("#skills");
    if (!skillsInput) return;
    const current = skillsInput.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (current.includes(reference)) return;
    skillsInput.value = [...current, reference].join(", ");
  }

  private buildPatch(): SwarmNodePatchInput {
    const nameInput = this.renderRoot.querySelector<HTMLInputElement>("#name");
    const typeInput = this.renderRoot.querySelector<HTMLSelectElement>("#type");
    const promptInput = this.renderRoot.querySelector<HTMLTextAreaElement>("#prompt");
    const agentInput = this.renderRoot.querySelector<HTMLInputElement>("#agent");
    const skillsInput = this.renderRoot.querySelector<HTMLInputElement>("#skills");
    const enabledInput = this.renderRoot.querySelector<HTMLInputElement>("#enabled");
    const scheduleMode = this.scheduleMode;

    const schedule: SwarmNodePatchInput["schedule"] =
      scheduleMode === "manual" || scheduleMode === "dependency"
        ? { mode: scheduleMode }
        : scheduleMode === "every"
          ? {
            mode: "every",
            everySeconds: Number.isFinite(Number(this.scheduleEverySeconds))
              && Number(this.scheduleEverySeconds) > 0
              ? Number(this.scheduleEverySeconds)
              : 60,
          }
          : scheduleMode === "at"
            ? {
              mode: "at",
              at: this.scheduleAtISO.trim()
                || (this.node?.schedule.mode === "at" ? this.node.schedule.at : new Date(Date.now() + 60 * 60 * 1000).toISOString()),
            }
            : {
              mode: "cron",
              expr: this.scheduleCronExpr.trim()
                || (this.node?.schedule.mode === "cron" ? this.node.schedule.expr : "0 9 * * *"),
              tz: this.scheduleTimezone.trim() || undefined,
            };

    return {
      name: nameInput?.value.trim() ?? "",
      type: (typeInput?.value as SwarmNodeType | undefined) ?? "agent_task",
      prompt: promptInput?.value.trim() ?? "",
      agentId: agentInput?.value.trim() ?? "",
      skillRefs: (skillsInput?.value ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      schedule,
      enabled: enabledInput?.checked ?? true,
    };
  }

  render() {
    if (!this.workflow || !this.node) return html`<div class="body"><div class="muted">Select a node on the graph to edit orchestration details.</div></div>`;
    const edgeTargets = this.workflow.nodes.filter((n) => n.id !== this.node?.id);

    return html`
      ${this.activeRunId ? html`
        <div class="tabs">
          <button class="tab ${this.activeTab === 'config' ? 'active' : ''}" @click=${() => this.activeTab = 'config'}>Config</button>
          <button class="tab ${this.activeTab === 'activity' ? 'active' : ''}" @click=${() => this.activeTab = 'activity'}>
            Live Activity
            <span class="live-dot"></span>
          </button>
        </div>
      ` : nothing}
      ${this.activeTab === 'activity' && this.activeRunId ? html`
        <div class="activity-area">
          <swarm-activity-stream .runId=${this.activeRunId} .nodeName=${this.node.name}></swarm-activity-stream>
        </div>
      ` : html`<div class="body">
        <div class="panel-head">
          <div class="panel-title">
            <span class="name">${this.node.name}</span>
            <span class="chip">${this.node.type}</span>
          </div>
          <div class="chips">
            <span class="chip ${this.node.enabled ? "live" : ""}">${this.node.enabled ? "Enabled" : "Disabled"}</span>
            <span class="chip">${this.scheduleChip()}</span>
            ${this.orchestrationNodeState
              ? html`<span class="chip ${this.orchestrationStatusClass(this.orchestrationNodeState.status)}">Flow ${this.orchestrationStatusLabel(this.orchestrationNodeState.status)}</span>`
              : nothing}
            ${this.node.jobId ? html`<span class="chip">job ${this.node.jobId.slice(0, 8)}</span>` : html`<span class="chip">no job</span>`}
          </div>
          ${this.orchestrationNodeState?.reason
            ? html`<div class="hint">${this.orchestrationNodeState.reason}</div>`
            : nothing}
        </div>

        <div class="section">
          <div class="row">
            <div class="label">Node</div>
            <input id="name" class="input" .value=${this.node.name} ?disabled=${this.busy} />
          </div>
          <div class="row2">
            <div class="row">
              <div class="label">Type</div>
              <select id="type" class="select" .value=${this.node.type} ?disabled=${this.busy}>
                <option value="trigger">trigger</option>
                <option value="agent_task">agent_task</option>
                <option value="skill_builder">skill_builder</option>
                <option value="integration_task">integration_task</option>
                <option value="router">router</option>
                <option value="approval_gate">approval_gate</option>
              </select>
            </div>
            <div class="row">
              <div class="label">Agent</div>
              <input id="agent" class="input" .value=${this.node.agentId ?? ""} ?disabled=${this.busy} />
            </div>
          </div>
          <div class="row">
            <div class="label">Prompt</div>
            <textarea id="prompt" class="textarea" ?disabled=${this.busy}>${this.node.prompt ?? ""}</textarea>
          </div>
        </div>

        <div class="section">
          <div class="row2">
            <div class="row">
              <div class="label">Schedule mode</div>
              <select
                id="schedule-mode"
                class="select"
                .value=${this.scheduleMode}
                ?disabled=${this.busy}
                @change=${(e: Event) => {
                  this.scheduleMode = (e.target as HTMLSelectElement).value as typeof this.scheduleMode;
                }}
              >
                <option value="manual">manual</option>
                <option value="dependency">dependency</option>
                <option value="every">every</option>
                <option value="at">at</option>
                <option value="cron">cron</option>
              </select>
            </div>
            <div class="row">
              <div class="label">Run model</div>
              <div class="hint">
                <strong>manual/dependency</strong> run on demand. <strong>every/cron/at</strong> run through persistent scheduler jobs (24/7 capable while daemon is running).
              </div>
            </div>
            ${this.scheduleMode === "every" ? html`
              <div class="row">
                <div class="label">Every (seconds)</div>
                <input
                  id="schedule-every"
                  class="input"
                  type="number"
                  min="1"
                  .value=${this.scheduleEverySeconds}
                  ?disabled=${this.busy}
                  @input=${(e: Event) => {
                    this.scheduleEverySeconds = (e.target as HTMLInputElement).value;
                  }}
                />
              </div>
            ` : nothing}
            ${this.scheduleMode === "at" ? html`
              <div class="row">
                <div class="label">At (ISO)</div>
                <input
                  id="schedule-at"
                  class="input"
                  .value=${this.scheduleAtISO}
                  placeholder="2026-02-17T14:00:00Z"
                  ?disabled=${this.busy}
                  @input=${(e: Event) => {
                    this.scheduleAtISO = (e.target as HTMLInputElement).value;
                  }}
                />
              </div>
            ` : nothing}
            ${this.scheduleMode === "cron" ? html`
              <div class="row">
                <div class="label">Cron expression</div>
                <input
                  id="schedule-cron"
                  class="input"
                  .value=${this.scheduleCronExpr}
                  placeholder="0 * * * *"
                  ?disabled=${this.busy}
                  @input=${(e: Event) => {
                    this.scheduleCronExpr = (e.target as HTMLInputElement).value;
                  }}
                />
              </div>
            ` : nothing}
            ${this.scheduleMode === "cron" ? html`
              <div class="row">
                <div class="label">Timezone</div>
                <input
                  id="schedule-timezone"
                  class="input"
                  .value=${this.scheduleTimezone}
                  placeholder="America/New_York"
                  ?disabled=${this.busy}
                  @input=${(e: Event) => {
                    this.scheduleTimezone = (e.target as HTMLInputElement).value;
                  }}
                />
              </div>
            ` : nothing}
          </div>
        </div>

        <div class="section">
          <div class="row">
            <div class="label">Skills (comma-separated)</div>
            <input id="skills" class="input" .value=${this.node.skillRefs.join(", ")} ?disabled=${this.busy} />
          </div>
          <div class="skill-search-row">
            <input
              class="input"
              .value=${this.skillSearchQuery}
              placeholder="Search skills.sh (e.g. changelog, testing)"
              ?disabled=${this.busy || this.skillSearching}
              @input=${(e: Event) => { this.skillSearchQuery = (e.target as HTMLInputElement).value; }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void this.searchSkillsRegistry();
                }
              }}
            />
            <button class="btn-mini" ?disabled=${this.busy || this.skillSearching} @click=${() => this.searchSkillsRegistry()}>
              ${this.skillSearching ? "Searching..." : "Search skills.sh"}
            </button>
          </div>
          <div class="skill-hint">Uses the same skills.sh registry search strategy from the Skills page. Click Add to append into this node.</div>
          ${this.skillSearchError ? html`<div class="skill-error">${this.skillSearchError}</div>` : nothing}
          ${this.skillSearchResults.length > 0 ? html`
            <div class="skill-results">
              ${this.skillSearchResults.map((item) => html`
                <div class="skill-item">
                  <span class="skill-ref">${item.reference}</span>
                  <button class="btn-mini" ?disabled=${this.busy} @click=${() => this.addSkillReference(item.reference)}>Add</button>
                </div>
              `)}
            </div>
          ` : nothing}
        </div>

        <div class="section">
          <div class="row">
            <label class="inline"><span><input id="enabled" type="checkbox" .checked=${this.node.enabled} ?disabled=${this.busy} /> Enabled</span><span class="muted">Node id: ${this.node.id.slice(0, 12)}</span></label>
          </div>
          <div class="row">
            <div class="label">Link to node</div>
            <select
              id="edge-target"
              class="select"
              .value=${this.edgeTarget}
              ?disabled=${this.busy || edgeTargets.length === 0}
              @change=${(e: Event) => { this.edgeTarget = (e.target as HTMLSelectElement).value; }}
            >
              <option value="">Select target node</option>
              ${edgeTargets.map((n) => html`<option value=${n.id}>${n.name}</option>`)}
            </select>
          </div>
          <div class="actions">
            <button class="btn" ?disabled=${this.busy} @click=${() => this.emit("node-save", this.buildPatch())}>Save</button>
            <button class="btn" ?disabled=${this.busy} @click=${() => this.emit("node-run")}>Run</button>
            <button class="btn btn-secondary" ?disabled=${this.busy} @click=${() => this.emit("node-run-history")}>Refresh</button>
            <button class="btn btn-secondary" ?disabled=${this.busy || !this.edgeTarget} @click=${() => this.emit("edge-link", { to: this.edgeTarget })}>Link</button>
            <button class="btn btn-danger" ?disabled=${this.busy} @click=${() => this.emit("node-delete")}>Delete</button>
          </div>
        </div>

        <div class="section">
          <div class="label">Recent runs</div>
          ${this.runs.length === 0 ? html`<div class="muted">No runs for this node.</div>` : nothing}
          ${this.runs.slice(0, 8).map((r) => html`
            <div class="run">
              <div class="run-head">
                <span class="run-id">${r.id.slice(0, 12)}</span>
                <span class="chip ${this.statusClass(r.status)}">${r.status}</span>
              </div>
              <div class="run-time">
                Updated ${this.fmtTime(r.updatedAt)}
              </div>
              <div class="actions">
                <button class="btn btn-secondary" @click=${() => this.emit("run-open", r.id)}>Open</button>
                ${["created", "planning", "applying"].includes(r.status) ? html`
                  <button class="btn btn-secondary" @click=${() => this.emit("run-action", { runId: r.id, action: "pause" })}>Pause</button>
                  <button class="btn btn-danger" @click=${() => this.emit("run-action", { runId: r.id, action: "cancel" })}>Cancel</button>
                ` : nothing}
                ${r.status === "paused" ? html`
                  <button class="btn btn-secondary" @click=${() => this.emit("run-action", { runId: r.id, action: "resume" })}>Resume</button>
                ` : nothing}
              </div>
            </div>
          `)}
        </div>
      </div>`}
    `;
  }
}
