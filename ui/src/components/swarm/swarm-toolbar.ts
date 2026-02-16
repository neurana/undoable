import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { SwarmWorkflow } from "../../api/client.js";

@customElement("swarm-toolbar")
export class SwarmToolbar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-divider);
      background: var(--surface-1);
    }
    .select {
      min-width: 200px;
      height: 32px;
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      background: var(--surface-1);
      color: var(--text-primary);
      padding: 0 10px;
      font: inherit;
    }
    .spacer { flex: 1; }
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
    @media (max-width: 720px) {
      :host { flex-wrap: wrap; }
      .spacer { display: none; }
      .select { width: 100%; }
    }
  `;

  @property({ attribute: false }) workflows: SwarmWorkflow[] = [];
  @property() workflowId = "";
  @property({ type: Boolean }) busy = false;

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  render() {
    return html`
      <select
        class="select"
        .value=${this.workflowId}
        ?disabled=${this.busy}
        @change=${(e: Event) => this.emit("workflow-change", (e.target as HTMLSelectElement).value)}
      >
        ${this.workflows.map((w) => html`<option value=${w.id}>${w.name}</option>`)}
      </select>
      <div class="spacer"></div>
      <button class="btn btn-secondary" ?disabled=${this.busy} @click=${() => this.emit("workflow-create")}>New workflow</button>
      <button class="btn" ?disabled=${this.busy || !this.workflowId} @click=${() => this.emit("node-create")}>Add node</button>
    `;
  }
}
