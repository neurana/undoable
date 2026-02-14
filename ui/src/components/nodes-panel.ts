import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { NodeItem } from "../api/client.js";

@customElement("undoable-nodes-panel")
export class UndoableNodesPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      color: var(--text-primary, #eee);
      font-family: var(--font-sans, system-ui, sans-serif);
    }

    .header {
      display: flex;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-divider, #2a2a2a);
    }
    .header h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      flex: 1;
    }
    .header-btn {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: transparent;
      border: none;
      color: var(--text-tertiary, #666);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 150ms ease;
    }
    .header-btn:hover {
      background: var(--wash, #1a1a1a);
      color: var(--text-primary, #eee);
    }
    .header-btn svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    .node-list {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .node-card {
      background: var(--surface-1, #1a1a1a);
      border: 1px solid var(--border-strong, #333);
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 10px;
    }

    .node-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .node-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .node-status[data-connected] {
      background: #4ade80;
      box-shadow: 0 0 6px rgba(74, 222, 128, 0.4);
    }
    .node-status:not([data-connected]) {
      background: var(--text-tertiary, #555);
    }

    .node-name {
      font-size: 14px;
      font-weight: 500;
      flex: 1;
    }

    .node-type {
      font-size: 11px;
      color: var(--text-tertiary, #555);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .node-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }

    .meta-tag {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      background: var(--wash-strong, #222);
      color: var(--text-secondary, #999);
    }

    .node-caps {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .cap-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-tertiary, #555);
      font-size: 13px;
      gap: 12px;
      text-align: center;
      padding: 24px;
    }
    .empty-state svg {
      width: 40px;
      height: 40px;
      stroke: currentColor;
      stroke-width: 1.5;
      fill: none;
      opacity: 0.4;
    }
    .empty-state p {
      margin: 0;
      line-height: 1.5;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-tertiary, #555);
      font-size: 13px;
    }
  `;

  @state() private nodes: NodeItem[] = [];
  @state() private loading = true;
  @state() private error = "";

  connectedCallback() {
    super.connectedCallback();
    this.loadNodes();
  }

  private async loadNodes() {
    this.loading = true;
    this.error = "";
    try {
      const token = localStorage.getItem("undoable_token");
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch("/api/connectors", { headers });
      if (res.ok) {
        this.nodes = await res.json();
      } else {
        this.nodes = [];
      }
    } catch (e) {
      this.error = (e as Error).message;
      this.nodes = [];
    }
    this.loading = false;
  }

  private formatTime(ms?: number): string {
    if (!ms) return "";
    const d = new Date(ms);
    return d.toLocaleTimeString();
  }

  render() {
    if (this.loading) {
      return html`<div class="loading">Loading nodes...</div>`;
    }

    return html`
      <div class="header">
        <h2>Nodes</h2>
        <button class="header-btn" @click=${this.loadNodes} title="Refresh">
          <svg viewBox="0 0 24 24"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
        </button>
      </div>
      <div class="node-list">
        ${this.error ? html`<div class="empty-state"><p style="color:#f87171">${this.error}</p></div>` : ""}
        ${!this.error && this.nodes.length === 0
          ? html`
              <div class="empty-state">
                <svg viewBox="0 0 24 24">
                  <rect x="5" y="2" width="14" height="20" rx="2"/>
                  <path d="M12 18h.01"/>
                </svg>
                <p>No devices connected.<br/>Use connectors to add devices.</p>
              </div>
            `
          : this.nodes.map((node) => html`
              <div class="node-card">
                <div class="node-header">
                  <div class="node-status" ?data-connected=${node.connected}></div>
                  <span class="node-name">${node.displayName || node.nodeId}</span>
                  <span class="node-type">${node.connectorType}</span>
                </div>
                <div class="node-meta">
                  ${node.platform ? html`<span class="meta-tag">${node.platform}</span>` : ""}
                  ${node.connectedAt ? html`<span class="meta-tag">Since ${this.formatTime(node.connectedAt)}</span>` : ""}
                </div>
                ${node.capabilities.length > 0
                  ? html`
                      <div class="node-caps">
                        ${node.capabilities.map((cap) => html`<span class="cap-badge">${cap}</span>`)}
                      </div>
                    `
                  : ""
                }
              </div>
            `)
        }
      </div>
    `;
  }
}
