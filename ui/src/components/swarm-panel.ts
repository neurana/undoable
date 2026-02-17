import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, type RunItem, type SwarmNodePatchInput, type SwarmWorkflow } from "../api/client.js";
import "./swarm/swarm-canvas.js";
import "./swarm/swarm-inspector.js";
import "./swarm/swarm-multi-terminal.js";
import "./run-detail.js";

const POSITIONS_KEY = "undoable_swarm_positions_v1";

type NodePos = { x: number; y: number };
type PositionMap = Record<string, NodePos>;

@customElement("swarm-panel")
export class SwarmPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background: var(--bg-base);
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--border-divider);
    }

    /* ── Top nav bar ── */
    .nav {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--border-divider);
      background: var(--surface-1);
      flex-shrink: 0;
      min-height: 40px;
    }
    .nav-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.01em;
      flex-shrink: 0;
    }
    .nav-sep {
      width: 1px;
      height: 16px;
      background: var(--border-divider);
      flex-shrink: 0;
    }
    .nav-select {
      height: 28px;
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: var(--surface-1);
      color: var(--text-primary);
      padding: 0 8px;
      font: inherit;
      font-size: 11px;
      min-width: 0;
      max-width: 200px;
    }
    .nav-spacer { flex: 1; }
    .nav-pills {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .pill {
      padding: 2px 7px;
      border-radius: 999px;
      border: 1px solid var(--border-strong);
      background: var(--surface-2);
      font-size: 9px;
      color: var(--text-tertiary);
      white-space: nowrap;
    }
    .pill-live {
      background: color-mix(in srgb, var(--accent-subtle) 85%, transparent);
      color: var(--dark);
      border-color: var(--mint-strong);
    }
    .nav-btn {
      height: 28px;
      padding: 0 8px;
      border-radius: 8px;
      border: 1px solid var(--border-strong);
      background: var(--surface-1);
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 150ms ease;
      flex-shrink: 0;
    }
    .nav-btn:hover {
      background: var(--wash);
      border-color: var(--mint-strong);
      color: var(--text-primary);
    }
    .nav-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .nav-btn-primary {
      background: var(--dark);
      color: #fff;
      border-color: var(--dark);
    }
    .nav-btn-primary:hover {
      background: var(--accent-hover);
    }
    .nav-btn-run {
      background: color-mix(in srgb, var(--accent-subtle) 85%, transparent);
      color: var(--dark);
      border-color: var(--mint-strong);
    }
    .nav-btn-run:hover {
      background: var(--accent-subtle);
    }
    .nav-btn-run.paused {
      background: var(--warning-subtle);
      color: var(--warning);
      border-color: rgba(184,134,11,0.2);
    }
    .nav-btn-run.paused:hover {
      background: rgba(184,134,11,0.12);
    }
    .nav-btn-danger {
      color: var(--danger);
      border-color: rgba(192,57,43,0.18);
    }
    .nav-btn-danger:hover {
      background: var(--danger-subtle);
    }
    .nav-btn svg {
      width: 12px;
      height: 12px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }
    .nav-close {
      width: 28px;
      height: 28px;
      padding: 0;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--text-tertiary);
      cursor: pointer;
      border-radius: 6px;
      display: flex;
      align-items: center;
      transition: all 150ms ease;
      flex-shrink: 0;
    }
    .nav-close:hover {
      background: var(--wash);
      color: var(--text-primary);
    }
    .nav-close svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    /* ── Content area: canvas + inspector side by side ── */
    .content {
      flex: 1;
      min-height: 0;
      display: flex;
      overflow: hidden;
    }
    .canvas-area {
      flex: 1;
      min-width: 0;
      min-height: 0;
    }
    swarm-canvas {
      width: 100%;
      height: 100%;
      border: none;
      border-radius: 0;
    }

    /* ── Inspector side panel ── */
    .inspector-col {
      width: clamp(320px, 36%, 420px);
      min-width: 320px;
      max-width: 420px;
      flex-shrink: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border-left: 1px solid var(--border-divider);
      background: var(--surface-1);
      transition: width 200ms ease, opacity 200ms ease;
      overflow: hidden;
    }
    .inspector-col.hidden {
      width: 0;
      min-width: 0;
      max-width: 0;
      border-left-color: transparent;
      opacity: 0;
      pointer-events: none;
    }
    swarm-inspector {
      flex: 1;
      min-height: 0;
      border: none;
      border-radius: 0;
      overflow: auto;
    }

    /* ── Error bar ── */
    .err {
      padding: 6px 10px;
      background: var(--danger-subtle);
      color: var(--danger);
      font-size: 11px;
      border-bottom: 1px solid rgba(192,57,43,0.18);
      flex-shrink: 0;
    }
    .danger-banner {
      padding: 8px 12px;
      background: rgba(192,57,43,0.08);
      color: var(--danger);
      font-size: 11px;
      font-weight: 500;
      border-bottom: 1px solid rgba(192,57,43,0.18);
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .danger-banner svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
      flex-shrink: 0;
    }
    .nav-btn.active {
      background: var(--dark);
      color: #fff;
      border-color: var(--dark);
    }

    /* ── Empty state ── */
    .empty-stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 12px;
      color: var(--text-tertiary);
      font-size: 13px;
    }
    .empty-stage svg {
      width: 40px;
      height: 40px;
      stroke: currentColor;
      stroke-width: 1.2;
      fill: none;
      opacity: 0.4;
    }

    @media (max-width: 640px) {
      .nav-pills { display: none; }
      .nav-select { max-width: 120px; }
      .inspector-col {
        width: 100%;
        max-width: 100%;
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        z-index: 5;
      }
      .inspector-col.hidden {
        width: 0;
        max-width: 0;
      }
      .content {
        position: relative;
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
  @state() private inspectorOpen = true;
  @state() private activeRunsByNode: Record<string, string> = {};
  @state() private viewMode: "canvas" | "terminal" = "canvas";
  @state() private selectedRunId = "";
  private pollTimer?: ReturnType<typeof setTimeout>;
  private connected = false;

  connectedCallback() {
    super.connectedCallback();
    this.connected = true;
    this.positions = this.loadPositions();
    void this.loadWorkflows();
    this.startPolling();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.connected = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  private startPolling() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (!this.connected) return;
    this.pollTimer = setTimeout(() => this.pollActiveRuns(), 3000);
  }

  private async pollActiveRuns() {
    if (!this.connected) return;
    const workflow = this.workflow;
    if (!workflow) {
      this.activeRunsByNode = {};
      this.startPolling();
      return;
    }
    const hasActive = Object.keys(this.activeRunsByNode).length > 0;
    const activeMap: Record<string, string> = {};
    for (const node of workflow.nodes) {
      try {
        const { runs } = await api.swarm.listNodeRuns(workflow.id, node.id);
        const activeRun = runs.find(r => ["created", "planning", "applying", "running"].includes(r.status));
        if (activeRun) activeMap[node.id] = activeRun.id;
      } catch { /* ignore */ }
    }
    this.activeRunsByNode = activeMap;
    if (this.selectedNodeId && !this.selectedRunId) await this.refreshRuns();
    const stillActive = Object.keys(activeMap).length > 0;
    if (stillActive || hasActive) {
      this.startPolling();
    }
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
    try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(this.positions)); } catch { }
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
      this.inspectorOpen = true;
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

  private async runNode() {
    if (!this.workflowId || !this.selectedNodeId) return;
    try {
      this.busy = true;
      await api.swarm.runNode(this.workflowId, this.selectedNodeId);
      await this.refreshRuns();
      this.busy = false;
      this.startPolling();
    } catch (e) {
      this.error = String(e);
      this.busy = false;
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
    this.selectedRunId = runId;
  }

  private async toggleWorkflowEnabled() {
    if (!this.workflowId || !this.workflow) return;
    if (!this.workflow.enabled) {
      const confirmed = confirm(
        "SWARM WARNING\n\n" +
        "Starting this workflow will allow AI agents to:\n" +
        "- Execute commands on your system\n" +
        "- Read and write files\n" +
        "- Make network requests\n\n" +
        "Are you sure you want to activate this workflow?"
      );
      if (!confirmed) return;
    }
    try {
      this.busy = true;
      await api.swarm.updateWorkflow(this.workflowId, { enabled: !this.workflow.enabled });
      await this.loadWorkflows();
    } catch (e) {
      this.error = String(e);
      this.busy = false;
    }
  }

  private async deleteWorkflow() {
    if (!this.workflowId) return;
    if (!confirm("Delete this workflow?")) return;
    try {
      this.busy = true;
      await api.swarm.deleteWorkflow(this.workflowId);
      this.workflowId = "";
      this.selectedNodeId = "";
      await this.loadWorkflows();
    } catch (e) {
      this.error = String(e);
      this.busy = false;
    }
  }

  private emitClose() {
    this.dispatchEvent(new CustomEvent("swarm-close", { bubbles: true, composed: true }));
  }

  render() {
    const workflow = this.workflow;
    const selectedNode = this.selectedNode;
    const nodeCount = workflow?.nodes.length ?? 0;
    const edgeCount = workflow?.edges.length ?? 0;

    return html`
      <div class="nav">
        <span class="nav-title">SWARM</span>
        <div class="nav-sep"></div>

        <select
          class="nav-select"
          .value=${this.workflowId}
          ?disabled=${this.busy}
          @change=${(e: Event) => { this.workflowId = (e.target as HTMLSelectElement).value; this.selectedNodeId = ""; void this.loadWorkflows(); }}
        >
          ${this.workflows.length === 0 ? html`<option value="">No workflows</option>` : ""}
          ${this.workflows.map((w) => html`<option value=${w.id}>${w.name}</option>`)}
        </select>

        <div class="nav-pills">
          <span class="pill ${workflow?.enabled ? "pill-live" : ""}">${workflow?.enabled ? "Live" : "Paused"}</span>
          <span class="pill">${nodeCount}n</span>
          <span class="pill">${edgeCount}e</span>
        </div>

        <div class="nav-spacer"></div>

        ${workflow ? html`
          <button class="nav-btn nav-btn-run ${workflow.enabled ? "" : "paused"}" ?disabled=${this.busy} @click=${() => this.toggleWorkflowEnabled()} title=${workflow.enabled ? "Pause workflow" : "Activate workflow"}>
            ${workflow.enabled ? html`
              <svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            ` : html`
              <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            `}
            ${workflow.enabled ? "Pause" : "Run"}
          </button>
        ` : nothing}

        <button class="nav-btn" ?disabled=${this.busy} @click=${() => this.createWorkflow()} title="New workflow">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Workflow
        </button>
        <button class="nav-btn nav-btn-primary" ?disabled=${this.busy || !this.workflowId} @click=${() => this.addNode()} title="Add node">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Node
        </button>
        ${workflow ? html`
          <button class="nav-btn nav-btn-danger" ?disabled=${this.busy} @click=${() => this.deleteWorkflow()} title="Delete workflow">
            <svg viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        ` : nothing}
        <button class="nav-btn" @click=${() => { this.inspectorOpen = !this.inspectorOpen; }} title=${this.inspectorOpen ? "Hide inspector" : "Show inspector"}>
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>
        </button>
        <button class="nav-btn ${this.viewMode === 'terminal' ? 'active' : ''}"
          @click=${() => { this.viewMode = this.viewMode === 'canvas' ? 'terminal' : 'canvas'; }}
          ?disabled=${Object.keys(this.activeRunsByNode).length === 0}
          title=${this.viewMode === 'canvas' ? 'Terminal View' : 'Canvas View'}>
          <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        </button>
        <button class="nav-close" @click=${() => this.emitClose()} title="Close SWARM">
          <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      ${this.error ? html`<div class="err">${this.error}</div>` : nothing}
      ${workflow?.enabled ? html`
        <div class="danger-banner">
          <svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
          <span>SWARM is active - AI agents are executing autonomously</span>
        </div>
      ` : nothing}

      <div class="content">
        ${this.selectedRunId ? html`
          <run-detail .runId=${this.selectedRunId} .backLabel=${"Back to SWARM"} @back=${() => { this.selectedRunId = ""; }}></run-detail>
        ` : this.viewMode === 'terminal' ? html`
          <swarm-multi-terminal
            .activeRuns=${Object.entries(this.activeRunsByNode).map(([nodeId, runId]) => ({
              nodeId,
              runId,
              nodeName: workflow?.nodes.find(n => n.id === nodeId)?.name ?? nodeId
            }))}
          ></swarm-multi-terminal>
        ` : html`
        <div class="canvas-area">
          ${!workflow && !this.busy ? html`
            <div class="empty-stage">
              <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="19" r="2"/><path d="M7 11L10 7M14 7L17 11M7 13L10 17M14 17L17 13"/></svg>
              <span>Create a workflow to get started</span>
            </div>
          ` : html`
            <swarm-canvas
              .workflow=${workflow}
              .selectedNodeId=${this.selectedNodeId}
              .positions=${this.positions}
              .activeRunsByNode=${this.activeRunsByNode}
              @node-select=${(e: CustomEvent<{ nodeId: string }>) => { this.selectedNodeId = e.detail.nodeId; this.inspectorOpen = true; void this.refreshRuns(); }}
              @node-move=${(e: CustomEvent<{ nodeId: string; x: number; y: number }>) => {
          this.positions = { ...this.positions, [e.detail.nodeId]: { x: e.detail.x, y: e.detail.y } };
          this.savePositions();
        }}
            ></swarm-canvas>
          `}
        </div>
        `}

        <div class="inspector-col ${this.inspectorOpen && selectedNode ? "" : "hidden"}">
          <swarm-inspector
            .workflow=${workflow}
            .node=${selectedNode}
            .runs=${this.runs}
            .busy=${this.busy}
            .activeRunId=${this.activeRunsByNode[this.selectedNodeId] ?? ""}
            @node-save=${(e: CustomEvent<SwarmNodePatchInput>) => this.saveNode(e.detail)}
            @node-delete=${() => this.deleteNode()}
            @node-run=${() => this.runNode()}
            @edge-link=${(e: CustomEvent<{ to?: string }>) => this.linkEdge(e.detail)}
            @node-run-history=${() => this.refreshRuns()}
            @run-action=${(e: CustomEvent<{ runId: string; action: string }>) => this.runAction(e.detail)}
            @run-open=${(e: CustomEvent<string>) => this.openRun(e.detail)}
          ></swarm-inspector>
        </div>
      </div>
    `;
  }
}
