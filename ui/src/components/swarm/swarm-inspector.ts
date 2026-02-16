import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { RunItem, SwarmNodePatchInput, SwarmNodeType, SwarmWorkflow, SwarmWorkflowNode } from "../../api/client.js";

@customElement("swarm-inspector")
export class SwarmInspector extends LitElement {
  static styles = css`
    :host { display: flex; flex-direction: column; border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--surface-1); min-height: 0; }
    .body { padding: 12px; overflow: auto; display: grid; gap: 10px; }
    .label { font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; }
    .input, .select, .textarea { border: 1px solid var(--border-strong); border-radius: 10px; background: var(--surface-1); color: var(--text-primary); font: inherit; }
    .input, .select { height: 32px; padding: 0 10px; }
    .textarea { min-height: 84px; padding: 8px 10px; resize: vertical; }
    .row { display: grid; gap: 6px; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .btn { height: 32px; border: none; border-radius: 10px; padding: 0 12px; font-size: 12px; cursor: pointer; background: var(--dark); color: #fff; }
    .btn-secondary { background: var(--surface-1); color: var(--text-secondary); border: 1px solid var(--border-strong); }
    .btn-danger { background: var(--danger-subtle); color: var(--danger); border: 1px solid rgba(192,57,43,0.18); }
    .run { border: 1px solid var(--border-divider); border-radius: 10px; padding: 8px; display: grid; gap: 6px; background: var(--surface-2); }
    .run-head { display: flex; justify-content: space-between; font-size: 12px; }
    .muted { font-size: 12px; color: var(--text-tertiary); }
  `;

  @property({ attribute: false }) workflow: SwarmWorkflow | null = null;
  @property({ attribute: false }) node: SwarmWorkflowNode | null = null;
  @property({ attribute: false }) runs: RunItem[] = [];
  @property({ type: Boolean }) busy = false;
  @state() private edgeTarget = "";

  protected willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has("node")) this.edgeTarget = "";
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
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
    if (!this.workflow || !this.node) return html`<div class="body"><div class="muted">Select a node to edit.</div></div>`;
    const edgeTargets = this.workflow.nodes.filter((n) => n.id !== this.node?.id);

    return html`
      <div class="body">
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
        <div class="row">
          <div class="label">Skills (comma-separated)</div>
          <input id="skills" class="input" .value=${this.node.skillRefs.join(", ")} ?disabled=${this.busy} />
        </div>
        <div class="row">
          <label class="muted"><input id="enabled" type="checkbox" .checked=${this.node.enabled} ?disabled=${this.busy} /> Enabled</label>
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

        <div class="row">
          <div class="label">Recent runs</div>
          ${this.runs.length === 0 ? html`<div class="muted">No runs for this node.</div>` : nothing}
          ${this.runs.slice(0, 8).map((r) => html`
            <div class="run">
              <div class="run-head">
                <span>${r.id.slice(0, 12)}</span>
                <span>${r.status}</span>
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
