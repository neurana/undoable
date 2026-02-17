import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import "./swarm-activity-stream.js";

type ActiveRun = { nodeId: string; nodeName: string; runId: string };

@customElement("swarm-multi-terminal")
export class SwarmMultiTerminal extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      padding: 8px;
      box-sizing: border-box;
      background: var(--surface-2);
    }
    .grid {
      display: grid;
      gap: 8px;
      height: 100%;
    }
    .pane {
      background: #1a1a1a;
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .pane-header {
      padding: 6px 10px;
      background: #2a2a2a;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .pane-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--mint-strong);
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .pane-title {
      font-size: 11px;
      color: #888;
      font-family: var(--mono);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    swarm-activity-stream {
      flex: 1;
      min-height: 0;
      --surface-1: #1a1a1a;
      --surface-2: #222;
      --text-primary: #e0e0e0;
      --text-secondary: #aaa;
      --text-tertiary: #666;
      --border-divider: #333;
    }
    .empty {
      display: grid;
      place-items: center;
      height: 100%;
      color: var(--text-tertiary);
      font-size: 13px;
    }
  `;

  @property({ attribute: false }) activeRuns: ActiveRun[] = [];

  render() {
    if (this.activeRuns.length === 0) {
      return html`<div class="empty">No active nodes running</div>`;
    }

    const cols = this.activeRuns.length === 1 ? 1 : this.activeRuns.length <= 4 ? 2 : 3;

    return html`
      <div class="grid" style="grid-template-columns: repeat(${cols}, 1fr)">
        ${this.activeRuns.map(run => html`
          <div class="pane">
            <div class="pane-header">
              <span class="pane-dot"></span>
              <span class="pane-title">${run.nodeName}</span>
            </div>
            <swarm-activity-stream
              .runId=${run.runId}
              .nodeName=${run.nodeName}
              compact
            ></swarm-activity-stream>
          </div>
        `)}
      </div>
    `;
  }
}
