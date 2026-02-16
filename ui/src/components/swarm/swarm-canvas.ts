import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { SwarmWorkflow } from "../../api/client.js";

type NodePos = { x: number; y: number };

@customElement("swarm-canvas")
export class SwarmCanvas extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 0;
      width: 100%;
      height: 100%;
      background: var(--surface-1);
      overflow: auto;
    }
    .canvas-stage {
      width: 100%;
      height: 100%;
      min-height: 0;
      overflow: auto;
      background: radial-gradient(circle at 1px 1px, var(--hatch-line) 1px, transparent 0) 0 0 / 18px 18px, var(--surface-2);
    }
    .scene {
      position: relative;
      min-width: 100%;
      min-height: 100%;
    }
    .edges { position: absolute; inset: 0; pointer-events: none; }
    .edge {
      fill: none;
      stroke: rgba(46,69,57,0.28);
      stroke-width: 2;
      stroke-dasharray: 2 6;
    }
    .node {
      position: absolute;
      width: 240px;
      border-radius: 14px;
      border: 1px solid var(--border-strong);
      background: var(--surface-1);
      box-shadow: var(--shadow-sm);
      cursor: grab;
      user-select: none;
    }
    .node:active {
      cursor: grabbing;
    }
    .node[data-selected] {
      border-color: var(--mint-strong);
      box-shadow: 0 0 0 1px var(--mint-strong), var(--shadow-card);
    }
    .node-top {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-divider);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .node-name {
      font-size: 13px;
      color: var(--text-primary);
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .node-type {
      font-size: 10px;
      border-radius: 999px;
      background: var(--accent-subtle);
      color: var(--dark);
      padding: 2px 8px;
    }
    .node-body {
      padding: 10px 12px;
      font-size: 11px;
      color: var(--text-tertiary);
      display: grid;
      gap: 6px;
    }
    .node-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .node-row span:last-child {
      color: var(--text-secondary);
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }
    .node-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--danger);
      flex-shrink: 0;
    }
    .dot.live {
      background: var(--mint-strong);
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
    @media (max-width: 768px) {
      .node {
        width: 200px;
      }
    }
  `;

  @property({ attribute: false }) workflow: SwarmWorkflow | null = null;
  @property() selectedNodeId = "";
  @property({ attribute: false }) positions: Record<string, NodePos> = {};

  private drag?: { nodeId: string; pointerId: number; offsetX: number; offsetY: number };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private getPos(nodeId: string, idx: number): NodePos {
    return this.positions[nodeId] ?? {
      x: 70 + (idx % 5) * 290,
      y: 80 + Math.floor(idx / 5) * 180,
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
    const width = Math.max(980, max.x + 360);
    const height = Math.max(620, max.y + 260);
    return { width, height };
  }

  private scheduleLabel(mode: string): string {
    if (mode === "manual") return "Manual";
    if (mode === "dependency") return "On dependency";
    if (mode === "cron") return "Cron";
    if (mode === "every") return "Interval";
    if (mode === "at") return "Specific time";
    return mode;
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
    };
    this.emit("node-select", { nodeId });
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    const pointer = this.scenePoint(e);
    const x = Math.max(12, Math.round(pointer.x - this.drag.offsetX));
    const y = Math.max(12, Math.round(pointer.y - this.drag.offsetY));
    this.emit("node-move", { nodeId: this.drag.nodeId, x, y });
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.drag = undefined;
  };

  private edgePath(fromX: number, fromY: number, toX: number, toY: number): string {
    const c1 = fromX + Math.min(150, Math.abs(toX - fromX) * 0.4);
    const c2 = toX - Math.min(150, Math.abs(toX - fromX) * 0.4);
    return `M ${fromX} ${fromY} C ${c1} ${fromY}, ${c2} ${toY}, ${toX} ${toY}`;
  }

  render() {
    const workflow = this.workflow;
    if (!workflow) return html`<div class="empty">Create or select a workflow</div>`;
    const size = this.sceneSize(workflow);

    return html`
      <div class="canvas-stage">
        <div class="scene" style=${`width:${size.width}px;height:${size.height}px;`}>
          <svg class="edges" viewBox=${`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
            ${workflow.edges.map((edge) => {
              const fromIndex = workflow.nodes.findIndex((n) => n.id === edge.from);
              const toIndex = workflow.nodes.findIndex((n) => n.id === edge.to);
              if (fromIndex < 0 || toIndex < 0) return html``;
              const fromNode = workflow.nodes[fromIndex]!;
              const toNode = workflow.nodes[toIndex]!;
              const from = this.getPos(fromNode.id, fromIndex);
              const to = this.getPos(toNode.id, toIndex);
              return html`<path class="edge" d=${this.edgePath(from.x + 240, from.y + 58, to.x, to.y + 58)}></path>`;
            })}
          </svg>
          ${workflow.nodes.map((node, idx) => {
            const pos = this.getPos(node.id, idx);
            return html`
              <div
                class="node"
                ?data-selected=${node.id === this.selectedNodeId}
                style=${`left:${pos.x}px;top:${pos.y}px;`}
                @pointerdown=${(e: PointerEvent) => this.startDrag(e, node.id, idx)}
                @click=${() => this.emit("node-select", { nodeId: node.id })}
              >
                <div class="node-top">
                  <span class="node-name">${node.name}</span>
                  <span class="node-type">${node.type}</span>
                </div>
                <div class="node-body">
                  <div class="node-row"><span>Schedule</span><span>${this.scheduleLabel(node.schedule.mode)}</span></div>
                  <div class="node-row">
                    <span class="node-status">
                      <span class="dot ${node.enabled ? "live" : ""}"></span>
                      <span>${node.enabled ? "Enabled" : "Disabled"}</span>
                    </span>
                    <span>${node.jobId ? node.jobId.slice(0, 8) : "No job"}</span>
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
