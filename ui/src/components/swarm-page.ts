import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, type RunItem, type SwarmNodePatchInput, type SwarmWorkflow } from "../api/client.js";
import "./swarm/swarm-toolbar.js";
import "./swarm/swarm-canvas.js";
import "./swarm/swarm-inspector.js";

const POSITIONS_KEY = "undoable_swarm_positions_v1";

type NodePos = { x: number; y: number };
type PositionMap = Record<string, NodePos>;

@customElement("swarm-page")
export class SwarmPage extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;
      min-height: 0;
      padding: 0 12px 12px;
      box-sizing: border-box;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
      gap: 12px;
      flex: 1 1 0;
      min-height: 0;
      overflow: hidden;
    }
    .left {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    .left swarm-toolbar {
      flex-shrink: 0;
    }
    .left swarm-canvas {
      flex: 1 1 0;
      min-height: 0;
    }
    .inspector-col {
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .inspector-col swarm-inspector {
      flex: 1 1 0;
      min-height: 0;
    }
    .err {
      margin: 0;
      border: 1px solid rgba(192, 57, 43, 0.25);
      background: var(--danger-subtle);
      color: var(--danger);
      padding: 10px;
      border-radius: 10px;
      font-size: 13px;
      flex-shrink: 0;
    }
    .muted {
      color: var(--text-tertiary);
      font-size: 13px;
      padding: 10px;
      border: 1px dashed var(--border-divider);
      border-radius: 10px;
      background: var(--surface-2);
    }
    @media (max-width: 1240px) {
      .layout {
        grid-template-columns: minmax(0, 1fr) 320px;
      }
    }
    @media (max-width: 900px) {
      .layout {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(300px, 1fr) minmax(400px, 1fr);
        overflow-y: auto;
      }
      .inspector-col {
        min-height: 400px;
      }
    }
    @media (max-width: 600px) {
      :host {
        padding: 0 8px 8px;
      }
      .layout {
        gap: 8px;
        grid-template-rows: minmax(250px, 1fr) minmax(350px, auto);
      }
    }
  `;

  @state() private workflows: SwarmWorkflow[] = [];
  @state() private workflowId = "";
  @state() private selectedNodeId = "";
  @state() private positions: PositionMap = {};
  @state() private runs: RunItem[] = [];
  @state() private busy = false;
  @state() private error = "";

  connectedCallback() {
    super.connectedCallback();
    this.positions = this.loadPositions();
    void this.loadWorkflows();
  }

  private get workflow(): SwarmWorkflow | null {
    return this.workflows.find((w) => w.id === this.workflowId) ?? null;
  }

  private get selectedNode() {
    return this.workflow?.nodes.find((n) => n.id === this.selectedNodeId) ?? null;
  }

  private loadPositions(): PositionMap {
    try {
      const raw = localStorage.getItem(POSITIONS_KEY);
      return raw ? (JSON.parse(raw) as PositionMap) : {};
    } catch {
      return {};
    }
  }

  private savePositions() {
    try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(this.positions)); } catch {}
  }

  private async loadWorkflows() {
    this.busy = true;
    this.error = "";
    const prevWorkflow = this.workflowId;
    const prevNode = this.selectedNodeId;
    try {
      this.workflows = await api.swarm.listWorkflows();
      if (!this.workflows.find((w) => w.id === prevWorkflow)) {
        this.workflowId = this.workflows[0]?.id ?? "";
      }
      if (!this.workflowId && this.workflows.length > 0) {
        this.workflowId = this.workflows[0]!.id;
      }

      const current = this.workflow;
      if (!current) {
        this.selectedNodeId = "";
        this.runs = [];
        return;
      }

      if (!current.nodes.some((n) => n.id === prevNode)) {
        this.selectedNodeId = current.nodes[0]?.id ?? "";
      }
      if (!this.selectedNodeId && current.nodes.length > 0) {
        this.selectedNodeId = current.nodes[0]!.id;
      }
      await this.refreshRuns();
    } catch (e) {
      this.error = String(e);
    } finally {
      this.busy = false;
    }
  }

  private async createWorkflow() {
    try {
      this.busy = true;
      await api.swarm.createWorkflow({ name: `Workflow ${new Date().toLocaleTimeString()}`, enabled: true });
      await this.loadWorkflows();
    } catch (e) {
      this.error = String(e);
      this.busy = false;
    }
  }

  private async addNode() {
    if (!this.workflowId) return;
    try {
      this.busy = true;
      const count = this.workflow?.nodes.length ?? 0;
      const node = await api.swarm.addNode(this.workflowId, {
        name: `Node ${count + 1}`,
        type: "agent_task",
        enabled: true,
        schedule: { mode: "manual" },
      });
      this.positions = { ...this.positions, [node.id]: { x: 120, y: 120 } };
      this.savePositions();
      this.selectedNodeId = node.id;
      await this.loadWorkflows();
    } catch (e) {
      this.error = String(e);
      this.busy = false;
    }
  }

  private async saveNode(patch: SwarmNodePatchInput) {
    if (!this.workflowId || !this.selectedNodeId) return;
    try {
      this.busy = true;
      await api.swarm.updateNode(this.workflowId, this.selectedNodeId, patch);
      await this.loadWorkflows();
    } catch (e) {
      this.error = String(e);
      this.busy = false;
    }
  }

  private async deleteNode() {
    if (!this.workflowId || !this.selectedNodeId) return;
    try {
      this.busy = true;
      const nodeId = this.selectedNodeId;
      await api.swarm.deleteNode(this.workflowId, nodeId);
      const next = { ...this.positions };
      delete next[nodeId];
      this.positions = next;
      this.savePositions();
      this.selectedNodeId = "";
      await this.loadWorkflows();
    } catch (e) {
      this.error = String(e);
      this.busy = false;
    }
  }

  private async linkEdge(detail: { to?: string }) {
    if (!this.workflowId || !this.selectedNodeId || !detail.to) return;
    try {
      this.busy = true;
      await api.swarm.upsertEdge(this.workflowId, { from: this.selectedNodeId, to: detail.to });
      await this.loadWorkflows();
    } catch (e) {
      this.error = String(e);
      this.busy = false;
    }
  }

  private async refreshRuns() {
    if (!this.workflowId || !this.selectedNodeId) {
      this.runs = [];
      return;
    }
    try {
      const out = await api.swarm.listNodeRuns(this.workflowId, this.selectedNodeId);
      this.runs = out.runs;
    } catch {
      this.runs = [];
    }
  }

  private async runAction(detail: { runId: string; action: string }) {
    try {
      await api.runs.action(detail.runId, detail.action);
      await this.refreshRuns();
    } catch (e) {
      this.error = String(e);
    }
  }

  private openRun(runId: string) {
    try {
      sessionStorage.setItem("undoable_selected_run_id", runId);
    } catch {
      // best effort only
    }
    window.history.pushState(null, "", "/jobs");
    this.dispatchEvent(new CustomEvent("navigate", { detail: "jobs", bubbles: true, composed: true }));
  }

  render() {
    const workflow = this.workflow;
    const selectedNode = this.selectedNode;

    return html`
      ${this.error ? html`<div class="err">${this.error}</div>` : ""}

      <div class="layout">
        <div class="left">
          <swarm-toolbar
            .workflows=${this.workflows}
            .workflow=${workflow}
            .workflowId=${this.workflowId}
            .selectedNodeName=${selectedNode?.name ?? ""}
            .busy=${this.busy}
            @workflow-change=${(e: CustomEvent<string>) => { this.workflowId = e.detail; this.selectedNodeId = ""; void this.loadWorkflows(); }}
            @workflow-create=${() => this.createWorkflow()}
            @node-create=${() => this.addNode()}
          ></swarm-toolbar>

          <swarm-canvas
            .workflow=${this.workflow}
            .selectedNodeId=${this.selectedNodeId}
            .positions=${this.positions}
            @node-select=${(e: CustomEvent<{ nodeId: string }>) => { this.selectedNodeId = e.detail.nodeId; void this.refreshRuns(); }}
            @node-move=${(e: CustomEvent<{ nodeId: string; x: number; y: number }>) => {
              this.positions = { ...this.positions, [e.detail.nodeId]: { x: e.detail.x, y: e.detail.y } };
              this.savePositions();
            }}
          ></swarm-canvas>
        </div>

        <div class="inspector-col">
          <swarm-inspector
            .workflow=${workflow}
            .node=${selectedNode}
            .runs=${this.runs}
            .busy=${this.busy}
            @node-save=${(e: CustomEvent<SwarmNodePatchInput>) => this.saveNode(e.detail)}
            @node-delete=${() => this.deleteNode()}
            @edge-link=${(e: CustomEvent<{ to?: string }>) => this.linkEdge(e.detail)}
            @node-run-history=${() => this.refreshRuns()}
            @run-action=${(e: CustomEvent<{ runId: string; action: string }>) => this.runAction(e.detail)}
            @run-open=${(e: CustomEvent<string>) => this.openRun(e.detail)}
          ></swarm-inspector>
        </div>
      </div>

      ${this.workflows.length === 0 && !this.busy ? html`<div class="muted">No workflows yet. Use “New workflow”.</div>` : ""}
    `;
  }
}
