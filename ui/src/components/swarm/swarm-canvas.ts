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
      background: radial-gradient(circle at 1px 1px, var(--hatch-line) 1px, transparent 0) 0 0 / 18px 18px, var(--surface-2);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      overflow: auto;
    }
    .scene {
      position: relative;
      width: 1800px;
      height: 1100px;
    }
    .edges { position: absolute; inset: 0; pointer-events: none; }
    .edge {
      fill: none;
      stroke: rgba(46,69,57,0.34);
      stroke-width: 2;
      stroke-dasharray: 2 6;
    }
    .node {
      position: absolute;
      width: 220px;
      border-radius: 14px;
      border: 1px solid var(--border-strong);
      background: var(--surface-1);
      box-shadow: var(--shadow-sm);
      cursor: grab;
      user-select: none;
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
    .node-name { font-size: 13px; color: var(--text-primary); font-weight: 500; }
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
      gap: 5px;
    }
    .empty {
      display: grid;
      place-items: center;
      height: 100%;
      color: var(--text-tertiary);
      font-size: 13px;
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

  private startDrag(e: PointerEvent, nodeId: string, idx: number) {
    if (e.button !== 0) return;
    const pos = this.getPos(nodeId, idx);
    this.drag = {
      nodeId,
      pointerId: e.pointerId,
      offsetX: e.clientX - pos.x,
      offsetY: e.clientY - pos.y,
    };
    this.emit("node-select", { nodeId });
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    const x = Math.max(12, Math.round(e.clientX - this.drag.offsetX));
    const y = Math.max(12, Math.round(e.clientY - this.drag.offsetY));
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

    return html`
      <div class="scene">
        <svg class="edges" viewBox="0 0 1800 1100" preserveAspectRatio="none">
          ${workflow.edges.map((edge) => {
            const fromIndex = workflow.nodes.findIndex((n) => n.id === edge.from);
            const toIndex = workflow.nodes.findIndex((n) => n.id === edge.to);
            if (fromIndex < 0 || toIndex < 0) return html``;
            const fromNode = workflow.nodes[fromIndex]!;
            const toNode = workflow.nodes[toIndex]!;
            const from = this.getPos(fromNode.id, fromIndex);
            const to = this.getPos(toNode.id, toIndex);
            return html`<path class="edge" d=${this.edgePath(from.x + 220, from.y + 58, to.x, to.y + 58)}></path>`;
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
                <div>${node.schedule.mode}</div>
                <div>${node.enabled ? "enabled" : "disabled"}${node.jobId ? ` • ${node.jobId.slice(0, 8)}` : ""}</div>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }
}
