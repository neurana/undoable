import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { SwarmWorkflow } from "../../api/client.js";

type NodePos = { x: number; y: number };
type NodeRunSnapshot = { runId: string; status: string; updatedAt: string };
type NodeVisualStatus = "idle" | "running" | "success" | "failed" | "paused";
type NodeSelectSource = "click" | "drag";

const NODE_WIDTH = 252;
const NODE_X_GAP = 304;
const NODE_Y_GAP = 196;
const NODE_FLOW_Y = 64;

@customElement("swarm-canvas")
export class SwarmCanvas extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-radius: 14px;
      border: 1px solid var(--border-divider);
      background:
        radial-gradient(circle at 50% 140%, rgba(174, 231, 199, 0.28), transparent 58%),
        var(--surface-1);
    }

    .canvas-stage {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 0;
      overflow: auto;
      background:
        radial-gradient(circle at 24% 24%, rgba(174, 231, 199, 0.2), transparent 34%),
        radial-gradient(circle at 80% 18%, rgba(171, 204, 186, 0.14), transparent 30%),
        var(--surface-2);
    }
    .canvas-stage::before {
      content: "";
      position: absolute;
      inset: -35% -12%;
      background:
        repeating-radial-gradient(
          circle at 50% 56%,
          transparent 0 130px,
          rgba(171, 204, 186, 0.36) 130px 132px
        );
      opacity: 0.42;
      pointer-events: none;
      animation: rings-drift 16s linear infinite;
    }
    .canvas-stage::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.16;
      background: repeating-linear-gradient(
        -42deg,
        rgba(17, 26, 23, 0.07) 0px,
        rgba(17, 26, 23, 0.07) 1px,
        transparent 1px,
        transparent 11px
      );
    }
    @keyframes rings-drift {
      0% { transform: rotate(0deg) scale(1); }
      50% { transform: rotate(1.2deg) scale(1.02); }
      100% { transform: rotate(0deg) scale(1); }
    }

    .canvas-stage::-webkit-scrollbar { width: 8px; height: 8px; }
    .canvas-stage::-webkit-scrollbar-track { background: transparent; }
    .canvas-stage::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
    .canvas-stage::-webkit-scrollbar-corner { background: transparent; }

    .scene {
      position: relative;
      min-width: 100%;
      min-height: 100%;
      isolation: isolate;
    }

    .edges { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
    .edge {
      fill: none;
      stroke: rgba(46, 69, 57, 0.22);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-dasharray: 6 9;
      animation: edge-flow 8s linear infinite;
    }
    .edge-active {
      stroke: rgba(46, 69, 57, 0.5);
      stroke-width: 2.4;
      stroke-dasharray: 4 7;
      animation-duration: 2.1s;
    }
    .edge-failed {
      stroke: rgba(192, 57, 43, 0.34);
      stroke-dasharray: 3 10;
    }
    @keyframes edge-flow {
      from { stroke-dashoffset: 0; }
      to { stroke-dashoffset: -170; }
    }

    .node {
      position: absolute;
      width: ${NODE_WIDTH}px;
      border-radius: 16px;
      border: 1px solid transparent;
      background:
        linear-gradient(180deg, rgba(253, 254, 253, 0.97) 0%, rgba(246, 250, 248, 0.93) 100%);
      box-shadow: 0 6px 20px rgba(17, 26, 23, 0.08);
      cursor: grab;
      user-select: none;
      z-index: 2;
      transform: translateZ(0);
      transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      overflow: hidden;
    }
    .node:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 34px rgba(17, 26, 23, 0.12);
    }
    .node:active { cursor: grabbing; }
    .node[data-dragging] {
      cursor: grabbing;
      transition: none;
      transform: scale(1.01);
      box-shadow: 0 16px 36px rgba(17, 26, 23, 0.16);
    }
    .node::before {
      content: "";
      position: absolute;
      inset: -1px;
      border-radius: inherit;
      padding: 1px;
      opacity: 0.5;
      pointer-events: none;
      background: linear-gradient(120deg, rgba(171, 204, 186, 0.75), rgba(171, 204, 186, 0.2), rgba(171, 204, 186, 0.75));
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
    }
    .node::after {
      content: "";
      position: absolute;
      inset: auto -30% -48%;
      height: 48%;
      border-radius: 100%;
      pointer-events: none;
      background: radial-gradient(circle at 50% 12%, rgba(174, 231, 199, 0.34), transparent 68%);
      opacity: 0.7;
    }
    .node[data-selected] {
      box-shadow: 0 0 0 1px rgba(46, 69, 57, 0.24), 0 16px 38px rgba(17, 26, 23, 0.14);
    }
    .node[data-status="running"]::before {
      opacity: 1;
      background: linear-gradient(
        120deg,
        rgba(171, 204, 186, 0.36),
        rgba(46, 69, 57, 0.94),
        rgba(171, 204, 186, 0.4)
      );
      background-size: 220% 220%;
      animation: running-border-heartbeat 1.85s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    .node[data-status="running"]::after {
      opacity: 1;
      animation: running-aura-heartbeat 1.85s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    }
    .node[data-status="success"]::before {
      opacity: 0.9;
      background: linear-gradient(120deg, rgba(46, 125, 50, 0.6), rgba(46, 125, 50, 0.2), rgba(46, 125, 50, 0.6));
    }
    .node[data-status="failed"]::before {
      opacity: 0.95;
      background: linear-gradient(120deg, rgba(192, 57, 43, 0.7), rgba(192, 57, 43, 0.18), rgba(192, 57, 43, 0.7));
    }
    .node[data-status="paused"]::before {
      opacity: 0.8;
      background: linear-gradient(120deg, rgba(184, 134, 11, 0.6), rgba(184, 134, 11, 0.2), rgba(184, 134, 11, 0.6));
    }
    @keyframes running-border-heartbeat {
      0%, 100% {
        opacity: 0.8;
        background-position: 0% 50%;
        filter: drop-shadow(0 0 0 rgba(46, 69, 57, 0));
      }
      12% {
        opacity: 1;
        background-position: 100% 50%;
        filter: drop-shadow(0 0 8px rgba(46, 69, 57, 0.32));
      }
      24% {
        opacity: 0.84;
        background-position: 20% 50%;
        filter: drop-shadow(0 0 1px rgba(46, 69, 57, 0.1));
      }
      36% {
        opacity: 1;
        background-position: 100% 50%;
        filter: drop-shadow(0 0 12px rgba(46, 69, 57, 0.38));
      }
      52% {
        opacity: 0.8;
        background-position: 32% 50%;
        filter: drop-shadow(0 0 0 rgba(46, 69, 57, 0));
      }
    }
    @keyframes running-aura-heartbeat {
      0%, 100% {
        opacity: 0.26;
        transform: scale(1);
      }
      10% {
        opacity: 0.62;
        transform: scale(1.015);
      }
      20% {
        opacity: 0.28;
        transform: scale(1.003);
      }
      32% {
        opacity: 0.82;
        transform: scale(1.038);
      }
      48% {
        opacity: 0.26;
        transform: scale(1);
      }
    }

    .node-top {
      padding: 11px 12px 10px;
      border-bottom: 1px solid rgba(220, 230, 227, 0.9);
      display: grid;
      gap: 8px;
    }
    .node-headline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
    }
    .node-name {
      font-size: 13px;
      color: var(--text-primary);
      font-weight: 600;
      letter-spacing: -0.01em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .node-type {
      font-size: 10px;
      border-radius: 999px;
      background: var(--accent-subtle);
      color: var(--dark);
      border: 1px solid rgba(171, 204, 186, 0.55);
      padding: 2px 8px;
      text-transform: lowercase;
      flex-shrink: 0;
    }
    .node-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .status-pill,
    .job-pill {
      font-size: 9px;
      border-radius: 999px;
      border: 1px solid var(--border-strong);
      padding: 2px 8px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-secondary);
      background: rgba(253, 254, 253, 0.9);
      white-space: nowrap;
    }
    .job-pill {
      font-family: var(--mono);
      text-transform: none;
      letter-spacing: normal;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 112px;
    }
    .status-pill.running {
      border-color: var(--mint-strong);
      color: var(--dark);
      background: color-mix(in srgb, var(--accent-subtle) 86%, transparent);
      animation: status-breathe 1.7s ease-in-out infinite;
    }
    .status-pill.success {
      border-color: rgba(46, 125, 50, 0.25);
      color: #2e7d32;
      background: rgba(46, 125, 50, 0.08);
    }
    .status-pill.failed {
      border-color: rgba(192, 57, 43, 0.28);
      color: var(--danger);
      background: var(--danger-subtle);
    }
    .status-pill.paused {
      border-color: rgba(184, 134, 11, 0.24);
      color: var(--warning);
      background: rgba(184, 134, 11, 0.08);
    }
    @keyframes status-breathe {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.035); }
    }

    .node-body {
      padding: 10px 12px;
      font-size: 11px;
      color: var(--text-tertiary);
      display: grid;
      gap: 8px;
    }
    .node-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .node-row > span:first-child {
      color: var(--text-tertiary);
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.08em;
      font-weight: 600;
    }
    .node-row > span:last-child {
      color: var(--text-secondary);
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
      max-width: 60%;
    }
    .run-chip {
      font-size: 10px;
      border-radius: 999px;
      border: 1px solid var(--border-strong);
      background: var(--surface-2);
      color: var(--text-secondary);
      padding: 2px 8px;
      white-space: nowrap;
    }
    .run-chip.running {
      border-color: var(--mint-strong);
      background: color-mix(in srgb, var(--accent-subtle) 80%, transparent);
      color: var(--dark);
      animation: status-breathe 1.7s ease-in-out infinite;
    }
    .run-chip.success {
      border-color: rgba(46, 125, 50, 0.22);
      background: rgba(46, 125, 50, 0.08);
      color: #2e7d32;
    }
    .run-chip.failed {
      border-color: rgba(192, 57, 43, 0.26);
      background: var(--danger-subtle);
      color: var(--danger);
    }

    .empty {
      display: grid;
      place-items: center;
      height: 100%;
      color: var(--text-tertiary);
      font-size: 13px;
      padding: 24px;
      text-align: center;
    }
    .empty-guide {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      text-align: center;
      color: var(--text-tertiary);
      z-index: 3;
    }
    .empty-guide svg {
      width: 64px;
      height: 64px;
      stroke: var(--mint-strong);
      stroke-width: 1.5;
      fill: none;
      opacity: 0.65;
    }
    .empty-guide-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .empty-guide-text {
      font-size: 12px;
      line-height: 1.5;
      max-width: 250px;
    }
    .empty-guide-hint {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      padding: 6px 12px;
      border-radius: 999px;
      background: var(--surface-1);
      border: 1px dashed var(--border-strong);
    }
    .empty-guide-hint svg {
      width: 14px;
      height: 14px;
      opacity: 1;
    }

    @media (max-width: 860px) {
      .node {
        width: 228px;
      }
      .job-pill {
        max-width: 96px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .canvas-stage::before,
      .edge,
      .edge-active,
      .node::before,
      .node::after,
      .status-pill.running,
      .run-chip.running {
        animation: none !important;
      }
      .node {
        transition: none !important;
      }
    }
  `;

  @property({ attribute: false }) workflow: SwarmWorkflow | null = null;
  @property() selectedNodeId = "";
  @property({ attribute: false }) positions: Record<string, NodePos> = {};
  @property({ attribute: false }) activeRunsByNode: Record<string, string> = {};
  @property({ attribute: false }) latestRunsByNode: Record<string, NodeRunSnapshot> = {};
  @state() private draggingNodeId = "";

  private drag?: { nodeId: string; pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean };
  private animatedNodeIds = new Set<string>();
  private suppressClickNodeId = "";

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
  }

  protected updated(_changed: PropertyValues<this>) {
    const workflow = this.workflow;
    if (!workflow) {
      this.animatedNodeIds.clear();
      return;
    }

    const validNodeIds = new Set(workflow.nodes.map((node) => node.id));
    for (const existing of [...this.animatedNodeIds]) {
      if (!validNodeIds.has(existing)) this.animatedNodeIds.delete(existing);
    }

    const cards = this.renderRoot.querySelectorAll<HTMLElement>(".node");
    cards.forEach((card, idx) => {
      const nodeId = card.dataset.nodeId;
      if (!nodeId || this.animatedNodeIds.has(nodeId)) return;
      this.animatedNodeIds.add(nodeId);
      card.animate(
        [
          { opacity: 0, transform: "translateY(10px) scale(0.985)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ],
        {
          duration: 360,
          delay: Math.min(idx * 36, 160),
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both",
        },
      );
    });
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private getPos(nodeId: string, idx: number): NodePos {
    return this.positions[nodeId] ?? {
      x: 70 + (idx % 5) * NODE_X_GAP,
      y: 86 + Math.floor(idx / 5) * NODE_Y_GAP,
    };
  }

  private scenePoint(e: PointerEvent): NodePos {
    const stage = this.renderRoot.querySelector<HTMLElement>(".canvas-stage");
    if (!stage) return { x: e.clientX, y: e.clientY };
    const rect = stage.getBoundingClientRect();
    return {
      x: Math.round(e.clientX - rect.left + stage.scrollLeft),
      y: Math.round(e.clientY - rect.top + stage.scrollTop),
    };
  }

  private sceneSize(workflow: SwarmWorkflow): { width: number; height: number } {
    const max = workflow.nodes.reduce(
      (acc, node, idx) => {
        const pos = this.getPos(node.id, idx);
        return { x: Math.max(acc.x, pos.x), y: Math.max(acc.y, pos.y) };
      },
      { x: 0, y: 0 },
    );
    const width = Math.max(980, max.x + NODE_WIDTH + 180);
    const height = Math.max(640, max.y + 280);
    return { width, height };
  }

  private scheduleLabel(mode: string): string {
    if (mode === "manual") return "Manual";
    if (mode === "dependency") return "Dependency";
    if (mode === "cron") return "Cron";
    if (mode === "every") return "Interval";
    if (mode === "at") return "Specific time";
    return mode;
  }

  private runClass(status: string): string {
    const lower = status.toLowerCase();
    if (["created", "planning", "applying", "running"].includes(lower)) return "running";
    if (["completed", "done", "success"].includes(lower)) return "success";
    if (["failed", "cancelled", "error"].includes(lower)) return "failed";
    return "";
  }

  private nodeStatus(nodeId: string, enabled: boolean): NodeVisualStatus {
    if (!enabled) return "paused";
    if (this.activeRunsByNode[nodeId]) return "running";
    const latest = this.latestRunsByNode[nodeId];
    if (!latest) return "idle";
    const lower = latest.status.toLowerCase();
    if (["created", "planning", "applying", "running"].includes(lower)) return "running";
    if (["completed", "done", "success"].includes(lower)) return "success";
    if (["failed", "cancelled", "error"].includes(lower)) return "failed";
    return "idle";
  }

  private statusLabel(status: NodeVisualStatus): string {
    if (status === "running") return "Running";
    if (status === "success") return "Healthy";
    if (status === "failed") return "Attention";
    if (status === "paused") return "Paused";
    return "Idle";
  }

  private shortTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  private startDrag(e: PointerEvent, nodeId: string, idx: number) {
    if (e.button !== 0) return;
    const pos = this.getPos(nodeId, idx);
    const pointer = this.scenePoint(e);
    this.drag = {
      nodeId,
      pointerId: e.pointerId,
      offsetX: pointer.x - pos.x,
      offsetY: pointer.y - pos.y,
      startX: pointer.x,
      startY: pointer.y,
      moved: false,
    };
    this.draggingNodeId = nodeId;
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    const pointer = this.scenePoint(e);
    if (!this.drag.moved) {
      const dx = Math.abs(pointer.x - this.drag.startX);
      const dy = Math.abs(pointer.y - this.drag.startY);
      if (dx > 3 || dy > 3) {
        this.drag.moved = true;
        this.emit("node-select", { nodeId: this.drag.nodeId, source: "drag" satisfies NodeSelectSource });
      }
    }
    const x = Math.max(14, Math.round(pointer.x - this.drag.offsetX));
    const y = Math.max(14, Math.round(pointer.y - this.drag.offsetY));
    this.emit("node-move", { nodeId: this.drag.nodeId, x, y });
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    if (this.drag.moved) {
      this.suppressClickNodeId = this.drag.nodeId;
      setTimeout(() => {
        if (this.suppressClickNodeId === this.draggingNodeId) return;
        this.suppressClickNodeId = "";
      }, 0);
    }
    this.drag = undefined;
    this.draggingNodeId = "";
  };

  private handleNodeClick(nodeId: string) {
    if (this.suppressClickNodeId === nodeId) {
      this.suppressClickNodeId = "";
      return;
    }
    this.emit("node-select", { nodeId, source: "click" satisfies NodeSelectSource });
  }

  private edgePath(fromX: number, fromY: number, toX: number, toY: number): string {
    const c1 = fromX + Math.min(170, Math.abs(toX - fromX) * 0.42);
    const c2 = toX - Math.min(170, Math.abs(toX - fromX) * 0.42);
    return `M ${fromX} ${fromY} C ${c1} ${fromY}, ${c2} ${toY}, ${toX} ${toY}`;
  }

  render() {
    const workflow = this.workflow;
    if (!workflow) return html`<div class="empty">Create or select a workflow</div>`;
    const size = this.sceneSize(workflow);
    const hasNodes = workflow.nodes.length > 0;

    return html`
      <div class="canvas-stage">
        <div class="scene" style=${`width:${size.width}px;height:${size.height}px;`}>
          ${!hasNodes ? html`
            <div class="empty-guide">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v8M8 12h8"/>
              </svg>
              <div class="empty-guide-title">No nodes yet</div>
              <div class="empty-guide-text">Add your first node to start building your AI workflow</div>
              <div class="empty-guide-hint">
                <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
                Click "+ Node" in the toolbar
              </div>
            </div>
          ` : nothing}

          <svg class="edges" viewBox=${`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
            ${workflow.edges.map((edge) => {
              const fromIndex = workflow.nodes.findIndex((n) => n.id === edge.from);
              const toIndex = workflow.nodes.findIndex((n) => n.id === edge.to);
              if (fromIndex < 0 || toIndex < 0) return html``;
              const fromNode = workflow.nodes[fromIndex]!;
              const toNode = workflow.nodes[toIndex]!;
              const from = this.getPos(fromNode.id, fromIndex);
              const to = this.getPos(toNode.id, toIndex);
              const fromStatus = this.nodeStatus(fromNode.id, fromNode.enabled);
              const edgeClass = `edge ${fromStatus === "running" ? "edge-active" : ""} ${fromStatus === "failed" ? "edge-failed" : ""}`;
              return html`
                <path
                  class=${edgeClass}
                  d=${this.edgePath(from.x + NODE_WIDTH, from.y + NODE_FLOW_Y, to.x, to.y + NODE_FLOW_Y)}
                ></path>
              `;
            })}
          </svg>

          ${workflow.nodes.map((node, idx) => {
            const pos = this.getPos(node.id, idx);
            const latestRun = this.latestRunsByNode[node.id];
            const status = this.nodeStatus(node.id, node.enabled);
            return html`
              <div
                class="node"
                data-node-id=${node.id}
                data-status=${status}
                ?data-selected=${node.id === this.selectedNodeId}
                ?data-dragging=${this.draggingNodeId === node.id}
                style=${`left:${pos.x}px;top:${pos.y}px;`}
                @pointerdown=${(e: PointerEvent) => this.startDrag(e, node.id, idx)}
                @click=${() => this.handleNodeClick(node.id)}
              >
                <div class="node-top">
                  <div class="node-headline">
                    <span class="node-name">${node.name}</span>
                    <span class="node-type">${node.type}</span>
                  </div>
                  <div class="node-meta">
                    <span class="status-pill ${status}">${this.statusLabel(status)}</span>
                    <span class="job-pill">${node.jobId ? node.jobId.slice(0, 8) : "no job"}</span>
                  </div>
                </div>

                <div class="node-body">
                  <div class="node-row"><span>Schedule</span><span>${this.scheduleLabel(node.schedule.mode)}</span></div>
                  <div class="node-row"><span>State</span><span>${node.enabled ? "enabled" : "disabled"}</span></div>
                  <div class="node-row">
                    <span>Last run</span>
                    ${latestRun
                      ? html`<span class="run-chip ${this.runClass(latestRun.status)}">${latestRun.status} · ${this.shortTime(latestRun.updatedAt)}</span>`
                      : html`<span>no runs</span>`}
                  </div>
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }
}
