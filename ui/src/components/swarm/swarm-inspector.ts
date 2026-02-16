import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { RunItem, SwarmNodePatchInput, SwarmNodeType, SwarmWorkflow, SwarmWorkflowNode } from "../../api/client.js";

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

@customElement("swarm-inspector")
export class SwarmInspector extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      background: var(--surface-1);
      min-height: 0;
      overflow: hidden;
    }
    .body {
      padding: 10px;
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1;
      min-height: 0;
      display: grid;
      gap: 8px;
      align-content: start;
    }
    .panel-head {
      border: 1px solid var(--border-divider);
      border-radius: 10px;
      background: var(--surface-2);
      padding: 10px;
      display: grid;
      gap: 8px;
    }
    .panel-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chip {
      font-size: 10px;
      border-radius: 999px;
      padding: 2px 8px;
      border: 1px solid var(--border-strong);
      background: var(--surface-1);
      color: var(--text-secondary);
      white-space: nowrap;
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
      border-radius: 10px;
      padding: 9px;
      background: var(--surface-1);
      display: grid;
      gap: 8px;
    }
    .input, .select, .textarea {
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      background: var(--surface-1);
      color: var(--text-primary);
      font: inherit;
    }
    .input, .select { height: 32px; padding: 0 10px; }
    .textarea { min-height: 84px; padding: 8px 10px; resize: vertical; }
    .row { display: grid; gap: 6px; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .inline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .btn { height: 32px; border: none; border-radius: 10px; padding: 0 12px; font-size: 12px; cursor: pointer; background: var(--dark); color: #fff; }
    .btn-secondary { background: var(--surface-1); color: var(--text-secondary); border: 1px solid var(--border-strong); }
    .btn-danger { background: var(--danger-subtle); color: var(--danger); border: 1px solid rgba(192,57,43,0.18); }
    .skill-search-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      align-items: center;
    }
    .btn-mini {
      height: 30px;
      border-radius: 9px;
      border: 1px solid var(--border-strong);
      background: var(--surface-1);
      color: var(--text-secondary);
      padding: 0 10px;
      font-size: 11px;
      cursor: pointer;
    }
    .btn-mini:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .skill-results {
      display: grid;
      gap: 6px;
      max-height: 180px;
      overflow: auto;
    }
    .skill-item {
      border: 1px solid var(--border-divider);
      border-radius: 9px;
      padding: 7px 8px;
      background: var(--surface-2);
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
    .run { border: 1px solid var(--border-divider); border-radius: 10px; padding: 8px; display: grid; gap: 8px; background: var(--surface-2); }
    .run-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }
    .run-id { font-family: var(--mono); color: var(--text-secondary); }
    .run-time { font-size: 11px; color: var(--text-tertiary); }
    .muted { font-size: 12px; color: var(--text-tertiary); }
    @media (max-width: 920px) {
      .row2 { grid-template-columns: 1fr; }
      .inline { align-items: flex-start; flex-direction: column; }
      .skill-search-row {
        grid-template-columns: 1fr;
      }
    }
  `;

  @property({ attribute: false }) workflow: SwarmWorkflow | null = null;
  @property({ attribute: false }) node: SwarmWorkflowNode | null = null;
  @property({ attribute: false }) runs: RunItem[] = [];
  @property({ type: Boolean }) busy = false;
  @state() private edgeTarget = "";
  @state() private skillSearchQuery = "find skills";
  @state() private skillSearching = false;
  @state() private skillSearchError = "";
  @state() private skillSearchResults: RegistrySkillSearchItem[] = [];

  protected willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has("node")) {
      this.edgeTarget = "";
      this.skillSearchError = "";
      this.skillSearchResults = [];
      this.skillSearchQuery = "find skills";
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

    return {
      name: nameInput?.value.trim() ?? "",
      type: (typeInput?.value as SwarmNodeType | undefined) ?? "agent_task",
      prompt: promptInput?.value.trim() ?? "",
      agentId: agentInput?.value.trim() ?? "",
      skillRefs: (skillsInput?.value ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      enabled: enabledInput?.checked ?? true,
    };
  }

  render() {
    if (!this.workflow || !this.node) return html`<div class="body"><div class="muted">Select a node on the graph to edit orchestration details.</div></div>`;
    const edgeTargets = this.workflow.nodes.filter((n) => n.id !== this.node?.id);

    return html`
      <div class="body">
        <div class="panel-head">
          <div class="panel-title">
            <span class="name">${this.node.name}</span>
            <span class="chip">${this.node.type}</span>
          </div>
          <div class="chips">
            <span class="chip ${this.node.enabled ? "live" : ""}">${this.node.enabled ? "Enabled" : "Disabled"}</span>
            <span class="chip">${this.node.schedule.mode}</span>
            ${this.node.jobId ? html`<span class="chip">job ${this.node.jobId.slice(0, 8)}</span>` : html`<span class="chip">no job</span>`}
          </div>
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
            <button class="btn btn-secondary" ?disabled=${this.busy} @click=${() => this.emit("node-run-history")}>Refresh runs</button>
            <button class="btn btn-secondary" ?disabled=${this.busy || !this.edgeTarget} @click=${() => this.emit("edge-link", { to: this.edgeTarget })}>Link selected → target</button>
            <button class="btn btn-danger" ?disabled=${this.busy} @click=${() => this.emit("node-delete")}>Delete node</button>
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
      </div>
    `;
  }
}
