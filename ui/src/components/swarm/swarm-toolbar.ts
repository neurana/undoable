import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { SwarmWorkflow } from "../../api/client.js";

@customElement("swarm-toolbar")
export class SwarmToolbar extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 10px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface-1);
    }
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .section {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-width: 0;
    }
    .pill {
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--border-strong);
      background: var(--surface-2);
      font-size: 10px;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .pill-strong {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pill-live {
      background: color-mix(in srgb, var(--accent-subtle) 85%, transparent);
      color: var(--dark);
      border-color: var(--mint-strong);
    }
    .field {
      display: grid;
      gap: 4px;
      min-width: 0;
      width: min(340px, 100%);
    }
    .label {
      font-size: 10px;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .select {
      width: 100%;
      height: 32px;
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      background: var(--surface-1);
      color: var(--text-primary);
      padding: 0 10px;
      font: inherit;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-start;
      flex-shrink: 0;
    }
    .btn {
      height: 32px;
      border: none;
      border-radius: 10px;
      padding: 0 12px;
      font-size: 12px;
      cursor: pointer;
      background: var(--dark);
      color: #fff;
    }
    .btn-secondary {
      background: var(--surface-1);
      color: var(--text-secondary);
      border: 1px solid var(--border-strong);
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    @media (max-width: 1120px) {
      .bar {
        flex-wrap: wrap;
        justify-content: flex-start;
      }
      .section {
        width: 100%;
      }
      .actions {
        justify-content: flex-start;
      }
    }
    @media (max-width: 640px) {
      .field {
        width: 100%;
      }
    }
  `;

  @property({ attribute: false }) workflows: SwarmWorkflow[] = [];
  @property() workflowId = "";
  @property({ attribute: false }) workflow: SwarmWorkflow | null = null;
  @property() selectedNodeName = "";
  @property({ type: Boolean }) busy = false;

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  render() {
    const nodeCount = this.workflow?.nodes.length ?? 0;
    const edgeCount = this.workflow?.edges.length ?? 0;
    const stateLabel = this.workflow?.enabled ? "Live" : "Paused";
    const focused = this.selectedNodeName || "None";

    return html`
      <div class="bar">
        <div class="section">
          <label class="field">
            <span class="label">Workflow</span>
            <select
              class="select"
              .value=${this.workflowId}
              ?disabled=${this.busy}
              @change=${(e: Event) => this.emit("workflow-change", (e.target as HTMLSelectElement).value)}
            >
              ${this.workflows.length === 0 ? html`<option value="">No workflows yet</option>` : ""}
              ${this.workflows.map((w) => html`<option value=${w.id}>${w.name}</option>`)}
            </select>
          </label>

          <div class="summary">
            <span class="pill pill-strong">${this.workflow?.name ?? "SWARM Workflows"}</span>
            <span class="pill ${this.workflow?.enabled ? "pill-live" : ""}">${stateLabel}</span>
            <span class="pill">${nodeCount} nodes</span>
            <span class="pill">${edgeCount} links</span>
            <span class="pill">Focus: ${focused}</span>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-secondary" ?disabled=${this.busy} @click=${() => this.emit("workflow-create")}>New workflow</button>
          <button class="btn" ?disabled=${this.busy || !this.workflowId} @click=${() => this.emit("node-create")}>Add node</button>
        </div>
      </div>
    `;
  }
}
