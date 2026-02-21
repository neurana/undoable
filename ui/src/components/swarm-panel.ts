import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  api,
  type RunItem,
  type SwarmNodePatchInput,
  type SwarmOrchestrationDetail,
  type SwarmOrchestrationNodeStatus,
  type SwarmOrchestrationSummary,
  type SwarmWorkflow,
  type SwarmWorkflowRunResult,
} from "../api/client.js";
import "./swarm/swarm-canvas.js";
import "./swarm/swarm-inspector.js";
import "./swarm/swarm-multi-terminal.js";
import "./swarm/swarm-orchestration-timeline.js";
import "./run-detail.js";

const POSITIONS_KEY = "undoable_swarm_positions_v1";

type NodePos = { x: number; y: number };
type PositionMap = Record<string, NodePos>;
type NodeRunSnapshot = { runId: string; status: string; updatedAt: string };
type NodeOrchestrationSnapshot = { status: SwarmOrchestrationNodeStatus; reason?: string; runId?: string };
type NodeSelectEventDetail = { nodeId: string; source?: "click" | "drag" };

const ACTIVE_RUN_STATUSES = new Set([
  "created",
  "planning",
  "planned",
  "shadowing",
  "shadowed",
  "approval_required",
  "applying",
  "undoing",
  "running",
]);

@customElement("swarm-panel")
export class SwarmPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background:
        radial-gradient(circle at 78% -20%, rgba(174, 231, 199, 0.28), transparent 40%),
        var(--bg-base);
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid var(--border-divider);
    }
    :host(:fullscreen),
    :host(:-webkit-full-screen) {
      width: 100vw;
      height: 100vh;
      border-radius: 0;
      border: none;
    }

    /* ── Top nav bar ── */
    .nav {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-divider);
      background:
        linear-gradient(180deg, rgba(253, 254, 253, 0.95), rgba(246, 250, 248, 0.92));
      flex-shrink: 0;
      min-height: 46px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .nav-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .nav-sep {
      width: 1px;
      height: 16px;
      background: var(--border-divider);
      flex-shrink: 0;
    }
    .nav-select {
      height: 30px;
      border: 1px solid var(--border-strong);
      border-radius: 9px;
      background: rgba(253, 254, 253, 0.88);
      color: var(--text-primary);
      padding: 0 10px;
      font: inherit;
      font-size: 11px;
      min-width: 0;
      max-width: 230px;
    }
    .nav-spacer { flex: 1; }
    .nav-pills {
      display: flex;
      gap: 5px;
      flex-shrink: 0;
    }
    .pill {
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid var(--border-strong);
      background: rgba(253, 254, 253, 0.74);
      font-size: 9px;
      color: var(--text-tertiary);
      white-space: nowrap;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .pill-live {
      background: color-mix(in srgb, var(--accent-subtle) 85%, transparent);
      color: var(--dark);
      border-color: var(--mint-strong);
    }
    .nav-btn {
      height: 30px;
      padding: 0 10px;
      border-radius: 9px;
      border: 1px solid var(--border-strong);
      background: rgba(253, 254, 253, 0.84);
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 180ms cubic-bezier(0.22, 1, 0.36, 1);
      flex-shrink: 0;
    }
    .nav-btn:hover {
      transform: translateY(-1px);
      background: var(--surface-1);
      border-color: var(--mint-strong);
      color: var(--text-primary);
      box-shadow: 0 8px 18px rgba(17, 26, 23, 0.08);
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
      box-shadow: inset 0 0 0 1px rgba(46, 69, 57, 0.07);
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
      width: 30px;
      height: 30px;
      padding: 0;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--text-tertiary);
      cursor: pointer;
      border-radius: 8px;
      display: flex;
      align-items: center;
      transition: all 180ms cubic-bezier(0.22, 1, 0.36, 1);
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
      position: relative;
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
      width: clamp(340px, 34vw, 460px);
      min-width: 340px;
      max-width: 460px;
      flex-shrink: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border-left: 1px solid var(--border-divider);
      background: var(--surface-1);
      transition: width 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease, transform 220ms ease;
      overflow: hidden;
      transform: translateX(0);
      box-shadow: -14px 0 34px rgba(17, 26, 23, 0.08);
      z-index: 4;
    }
    .inspector-col.hidden {
      width: 0;
      min-width: 0;
      max-width: 0;
      border-left-color: transparent;
      opacity: 0;
      transform: translateX(14px);
      pointer-events: none;
      box-shadow: none;
    }
    swarm-inspector {
      flex: 1;
      min-height: 0;
      border: none;
      border-radius: 0;
      overflow: auto;
    }
    .inspector-backdrop {
      display: none;
      position: absolute;
      inset: 0;
      border: 0;
      background: rgba(17, 26, 23, 0.28);
      opacity: 0;
      pointer-events: none;
      transition: opacity 220ms ease;
      z-index: 3;
    }
    .inspector-backdrop.active {
      opacity: 1;
      pointer-events: auto;
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
      .nav-select { max-width: 132px; }
      .inspector-col {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        z-index: 5;
        border-left: none;
        box-shadow: -22px 0 34px rgba(17, 26, 23, 0.12);
      }
      .inspector-col.hidden {
        width: 100%;
        max-width: 100%;
        opacity: 0;
        transform: translateX(100%);
      }
      .inspector-backdrop {
        display: block;
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
  @state() private latestRunsByNode: Record<string, NodeRunSnapshot> = {};
  @state() private orchestrationNodeStatesByNode: Record<string, NodeOrchestrationSnapshot> = {};
  @state() private activeOrchestrationId = "";
  @state() private orchestrationStatus: "idle" | "running" | "completed" | "failed" = "idle";
  @state() private orchestrations: SwarmOrchestrationSummary[] = [];
  @state() private viewMode: "canvas" | "terminal" = "canvas";
  @state() private selectedRunId = "";
  @state() private isFullscreen = false;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private syncTimer?: ReturnType<typeof setTimeout>;
  private connected = false;
  private fullscreenChangeHandler = () => {
    this.isFullscreen = this.isOwnFullscreen();
  };

  connectedCallback() {
    super.connectedCallback();
    this.connected = true;
    document.addEventListener("fullscreenchange", this.fullscreenChangeHandler);
    document.addEventListener("webkitfullscreenchange", this.fullscreenChangeHandler as EventListener);
    this.fullscreenChangeHandler();
    this.positions = this.loadPositions();
    void this.loadWorkflows();
    this.startPolling();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.connected = false;
    document.removeEventListener("fullscreenchange", this.fullscreenChangeHandler);
    document.removeEventListener("webkitfullscreenchange", this.fullscreenChangeHandler as EventListener);
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.syncTimer) clearTimeout(this.syncTimer);
  }

  requestSync() {
    if (!this.connected) return;
    if (this.syncTimer) return;
    this.syncTimer = setTimeout(() => {
      this.syncTimer = undefined;
      void this.syncFromExternalChange();
    }, 220);
  }

  private async syncFromExternalChange() {
    if (!this.connected) return;
    if (this.busy) {
      this.requestSync();
      return;
    }
    await this.loadWorkflows();
    await this.pollActiveRuns();
  }

  private startPolling(delayMs = 3000) {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (!this.connected) return;
    this.pollTimer = setTimeout(() => this.pollActiveRuns(), delayMs);
  }

  private latestRun(runs: RunItem[]): RunItem | null {
    const [first, ...rest] = runs;
    if (!first) return null;
    return rest.reduce<RunItem>((latest, current) => {
      return new Date(current.updatedAt).getTime() > new Date(latest.updatedAt).getTime()
        ? current
        : latest;
    }, first);
  }

  private mapOrchestrationState(orchestration: SwarmOrchestrationDetail | null): Record<string, NodeOrchestrationSnapshot> {
    if (!orchestration) return {};
    const map: Record<string, NodeOrchestrationSnapshot> = {};
    for (const node of orchestration.nodes) {
      map[node.nodeId] = {
        status: node.status,
        reason: node.reason,
        runId: node.runId,
      };
    }
    return map;
  }

  private async resolveOrchestration(workflowId: string): Promise<SwarmOrchestrationDetail | null> {
    try {
      const out = await api.swarm.listOrchestrations(workflowId);
      this.orchestrations = out.orchestrations;
      if (out.orchestrations.length === 0) {
        this.activeOrchestrationId = "";
        return null;
      }

      const selected =
        out.orchestrations.find((entry) => entry.orchestrationId === this.activeOrchestrationId) ??
        out.orchestrations.find((entry) => entry.status === "running") ??
        out.orchestrations[0]!;

      this.activeOrchestrationId = selected.orchestrationId;
      return await api.swarm.getOrchestration(workflowId, selected.orchestrationId);
    } catch {
      this.orchestrations = [];
      return null;
    }
  }

  private applyOrchestrationToRuns(
    orchestration: SwarmOrchestrationDetail | null,
    activeMap: Record<string, string>,
    latestMap: Record<string, NodeRunSnapshot>,
  ) {
    if (!orchestration) {
      this.orchestrationStatus = "idle";
      this.orchestrationNodeStatesByNode = {};
      return;
    }

    this.orchestrationStatus = orchestration.status;
    this.orchestrationNodeStatesByNode = this.mapOrchestrationState(orchestration);

    for (const node of orchestration.nodes) {
      if (node.status === "running" && node.runId) {
        activeMap[node.nodeId] = node.runId;
      }

      if (!node.runId) continue;
      if (latestMap[node.nodeId]) continue;

      const updatedAt = node.completedAt ?? node.startedAt;
      if (!updatedAt) continue;
      latestMap[node.nodeId] = {
        runId: node.runId,
        status: node.status,
        updatedAt,
      };
    }
  }

  private async pollActiveRuns() {
    if (!this.connected) return;
    const workflow = this.workflow;
    if (!workflow) {
      this.activeRunsByNode = {};
      this.latestRunsByNode = {};
      this.activeOrchestrationId = "";
      this.orchestrationStatus = "idle";
      this.orchestrations = [];
      this.orchestrationNodeStatesByNode = {};
      this.startPolling(8000);
      return;
    }

    const hadActive = Object.keys(this.activeRunsByNode).length > 0;
    const [orchestration, runOutputs] = await Promise.all([
      this.resolveOrchestration(workflow.id),
      Promise.all(
        workflow.nodes.map(async (node) => {
          try {
            const { runs } = await api.swarm.listNodeRuns(workflow.id, node.id);
            return { nodeId: node.id, runs };
          } catch {
            return { nodeId: node.id, runs: [] as RunItem[] };
          }
        }),
      ),
    ]);

    const activeMap: Record<string, string> = {};
    const latestMap: Record<string, NodeRunSnapshot> = {};

    for (const output of runOutputs) {
      const latest = this.latestRun(output.runs);
      if (latest) {
        latestMap[output.nodeId] = {
          runId: latest.id,
          status: latest.status,
          updatedAt: latest.updatedAt,
        };
      }
      const activeRun = output.runs.find((run) => ACTIVE_RUN_STATUSES.has(run.status));
      if (activeRun) activeMap[output.nodeId] = activeRun.id;
    }

    this.applyOrchestrationToRuns(orchestration, activeMap, latestMap);
    this.activeRunsByNode = activeMap;
    this.latestRunsByNode = latestMap;
    if (this.selectedNodeId && !this.selectedRunId) {
      const selected = runOutputs.find((entry) => entry.nodeId === this.selectedNodeId);
      this.runs = selected ? selected.runs : [];
    }
    const stillActive = Object.keys(activeMap).length > 0;
    const orchestrationRunning = orchestration?.status === "running";
    this.startPolling(stillActive || hadActive || orchestrationRunning ? 3000 : 12000);
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
      if (prevWorkflow && this.workflowId !== prevWorkflow) {
        this.activeOrchestrationId = "";
        this.orchestrationStatus = "idle";
        this.orchestrations = [];
        this.orchestrationNodeStatesByNode = {};
        this.activeRunsByNode = {};
        this.latestRunsByNode = {};
      }

      const current = this.workflow;
      if (!current) {
        this.selectedNodeId = "";
        this.runs = [];
        this.activeOrchestrationId = "";
        this.orchestrationStatus = "idle";
        this.orchestrations = [];
        this.orchestrationNodeStatesByNode = {};
        this.activeRunsByNode = {};
        this.latestRunsByNode = {};
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
      const run = await api.swarm.runNode(this.workflowId, this.selectedNodeId);
      this.activeRunsByNode = { ...this.activeRunsByNode, [this.selectedNodeId]: run.id };
      this.orchestrationNodeStatesByNode = {
        ...this.orchestrationNodeStatesByNode,
        [this.selectedNodeId]: { status: "running", runId: run.id },
      };
      await this.refreshRuns();
      this.busy = false;
      this.startPolling();
    } catch (e) {
      this.error = String(e);
      this.busy = false;
    }
  }

  private async runWorkflowParallel() {
    if (!this.workflowId || !this.workflow) return;
    try {
      this.busy = true;
      const out: SwarmWorkflowRunResult = await api.swarm.runWorkflow(this.workflowId, { allowConcurrent: false });
      this.activeOrchestrationId = out.orchestrationId;
      this.orchestrationStatus = out.status;
      this.orchestrations = [
        {
          orchestrationId: out.orchestrationId,
          status: out.status,
          launched: out.launched,
          skipped: out.skipped,
          pendingNodes: out.pendingNodes,
          failedNodes: out.failedNodes,
          blockedNodes: out.blockedNodes,
          options: out.options,
          startedAt: out.startedAt,
          completedAt: out.completedAt,
        },
        ...this.orchestrations.filter((entry) => entry.orchestrationId !== out.orchestrationId),
      ].slice(0, 10);
      if (out.launched.length === 0 && out.skipped.length > 0) {
        const reasons = out.skipped.slice(0, 3).map((entry) => `${entry.nodeId}: ${entry.reason}`).join(" | ");
        this.error = `No nodes launched: ${reasons}`;
      } else {
        this.error = "";
      }

      const orchestrationNodes: Record<string, NodeOrchestrationSnapshot> = {};
      for (const nodeId of out.pendingNodes) {
        orchestrationNodes[nodeId] = { status: "pending" };
      }
      for (const nodeId of out.failedNodes) {
        orchestrationNodes[nodeId] = { status: "failed" };
      }
      for (const nodeId of out.blockedNodes) {
        orchestrationNodes[nodeId] = { status: "blocked" };
      }
      for (const launched of out.launched) {
        orchestrationNodes[launched.nodeId] = {
          status: "running",
          runId: launched.runId,
        };
      }
      this.orchestrationNodeStatesByNode = orchestrationNodes;

      const nextActive = { ...this.activeRunsByNode };
      for (const launched of out.launched) {
        nextActive[launched.nodeId] = launched.runId;
      }
      this.activeRunsByNode = nextActive;

      if (this.selectedNodeId) {
        await this.refreshRuns();
      }
      this.busy = false;
      this.startPolling(1200);
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
      this.activeOrchestrationId = "";
      this.orchestrationStatus = "idle";
      this.orchestrations = [];
      this.orchestrationNodeStatesByNode = {};
      this.activeRunsByNode = {};
      this.latestRunsByNode = {};
      await this.loadWorkflows();
    } catch (e) {
      this.error = String(e);
      this.busy = false;
    }
  }

  private emitClose() {
    this.dispatchEvent(new CustomEvent("swarm-close", { bubbles: true, composed: true }));
  }

  private getFullscreenElement(): Element | null {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  }

  private isOwnFullscreen(): boolean {
    const fullscreenElement = this.getFullscreenElement();
    if (!fullscreenElement) return false;
    if (fullscreenElement === this) return true;

    const host = this as HTMLElement;
    if (typeof host.matches === "function") {
      if (host.matches(":fullscreen")) return true;
      if (host.matches(":-webkit-full-screen")) return true;
    }

    return fullscreenElement.contains(host) || host.contains(fullscreenElement);
  }

  private async enterFullscreen() {
    const host = this as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      webkitRequestFullScreen?: () => Promise<void> | void;
    };
    if (typeof host.requestFullscreen === "function") {
      await host.requestFullscreen();
      return;
    }
    if (typeof host.webkitRequestFullscreen === "function") {
      await host.webkitRequestFullscreen();
      return;
    }
    if (typeof host.webkitRequestFullScreen === "function") {
      await host.webkitRequestFullScreen();
    }
  }

  private async exitFullscreen() {
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      webkitCancelFullScreen?: () => Promise<void> | void;
    };
    if (typeof document.exitFullscreen === "function") {
      await document.exitFullscreen();
      return;
    }
    if (typeof doc.webkitExitFullscreen === "function") {
      await doc.webkitExitFullscreen();
      return;
    }
    if (typeof doc.webkitCancelFullScreen === "function") {
      await doc.webkitCancelFullScreen();
    }
  }

  private async toggleFullscreen() {
    try {
      if (this.isOwnFullscreen() || this.isFullscreen) {
        await this.exitFullscreen();
      } else {
        await this.enterFullscreen();
      }
      this.fullscreenChangeHandler();
    } catch (err) {
      this.error = `Unable to toggle fullscreen: ${String(err)}`;
    }
  }

  private async onNodeSelect(detail: NodeSelectEventDetail) {
    this.selectedNodeId = detail.nodeId;
    const source = detail.source ?? "click";
    if (source === "click" || this.inspectorOpen) {
      this.inspectorOpen = true;
    }
    if (!this.selectedRunId) await this.refreshRuns();
  }

  private async selectOrchestration(orchestrationId: string) {
    if (!this.workflowId || !orchestrationId) return;
    this.activeOrchestrationId = orchestrationId;
    await this.pollActiveRuns();
  }

  render() {
    const workflow = this.workflow;
    const selectedNode = this.selectedNode;
    const nodeCount = workflow?.nodes.length ?? 0;
    const edgeCount = workflow?.edges.length ?? 0;
    const showInspector = this.inspectorOpen && !!selectedNode;

    return html`
      <div class="nav">
        <span class="nav-title">SWARM</span>
        <div class="nav-sep"></div>

        <select
          class="nav-select"
          .value=${this.workflowId}
          ?disabled=${this.busy}
          @change=${(e: Event) => {
            this.workflowId = (e.target as HTMLSelectElement).value;
            this.selectedNodeId = "";
            this.activeOrchestrationId = "";
            this.orchestrationStatus = "idle";
            this.orchestrations = [];
            this.orchestrationNodeStatesByNode = {};
            void this.loadWorkflows();
          }}
        >
          ${this.workflows.length === 0 ? html`<option value="">No workflows</option>` : ""}
          ${this.workflows.map((w) => html`<option value=${w.id}>${w.name}</option>`)}
        </select>

        <div class="nav-pills">
          <span class="pill ${workflow?.enabled ? "pill-live" : ""}">${workflow?.enabled ? "Live" : "Paused"}</span>
          <span class="pill">${nodeCount}n</span>
          <span class="pill">${edgeCount}e</span>
          ${this.activeOrchestrationId
            ? html`<span class="pill ${this.orchestrationStatus === "running" ? "pill-live" : ""}">${this.orchestrationStatus}</span>`
            : nothing}
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
          <button
            class="nav-btn nav-btn-primary"
            ?disabled=${this.busy || workflow.nodes.length === 0}
            @click=${() => this.runWorkflowParallel()}
            title="Run workflow orchestration"
          >
            <svg viewBox="0 0 24 24"><polygon points="4 3 20 12 4 21 4 3"/><path d="M10 4l10 8-10 8"/></svg>
            Run All
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
        <button
          class="nav-btn ${this.isFullscreen ? 'active' : ''}"
          @click=${() => { void this.toggleFullscreen(); }}
          title=${this.isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          ${this.isFullscreen
            ? html`<svg viewBox="0 0 24 24"><path d="M10 4H4v6M14 4h6v6M10 20H4v-6M20 14v6h-6"/></svg>`
            : html`<svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"/></svg>`}
        </button>
        <button class="nav-close" @click=${() => this.emitClose()} title="Close SWARM">
          <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      ${workflow || this.orchestrations.length > 0
        ? html`
          <swarm-orchestration-timeline
            .orchestrations=${this.orchestrations}
            .activeOrchestrationId=${this.activeOrchestrationId}
            .loading=${this.busy}
            @orchestration-select=${(e: CustomEvent<string>) => { void this.selectOrchestration(e.detail); }}
          ></swarm-orchestration-timeline>
        `
        : nothing}

      ${this.error ? html`<div class="err">${this.error}</div>` : nothing}
      ${workflow?.enabled ? html`
        <div class="danger-banner">
          <svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
          <span>SWARM is active - AI agents are executing autonomously</span>
        </div>
      ` : nothing}

      <div class="content">
        <button
          class="inspector-backdrop ${showInspector ? "active" : ""}"
          @click=${() => { this.inspectorOpen = false; }}
          aria-label="Close inspector"
        ></button>
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
              @node-select=${(e: CustomEvent<NodeSelectEventDetail>) => { void this.onNodeSelect(e.detail); }}
              @node-move=${(e: CustomEvent<{ nodeId: string; x: number; y: number }>) => {
          this.positions = { ...this.positions, [e.detail.nodeId]: { x: e.detail.x, y: e.detail.y } };
          this.savePositions();
        }}
              .latestRunsByNode=${this.latestRunsByNode}
              .orchestrationNodeStatesByNode=${this.orchestrationNodeStatesByNode}
            ></swarm-canvas>
          `}
        </div>
        `}

        <div class="inspector-col ${showInspector ? "" : "hidden"}">
          <swarm-inspector
            .workflow=${workflow}
            .node=${selectedNode}
            .runs=${this.runs}
            .busy=${this.busy}
            .activeRunId=${this.activeRunsByNode[this.selectedNodeId] ?? ""}
            .orchestrationNodeState=${this.orchestrationNodeStatesByNode[this.selectedNodeId] ?? null}
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
