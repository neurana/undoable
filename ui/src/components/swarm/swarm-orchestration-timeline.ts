import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { SwarmOrchestrationSummary } from "../../api/client.js";

@customElement("swarm-orchestration-timeline")
export class SwarmOrchestrationTimeline extends LitElement {
  static styles = css`
    :host {
      display: block;
      border-bottom: 1px solid var(--border-divider);
      background:
        linear-gradient(180deg, rgba(253, 254, 253, 0.95), rgba(246, 250, 248, 0.92));
      padding: 8px 12px;
      overflow-x: auto;
      overflow-y: hidden;
    }
    .row {
      display: flex;
      gap: 8px;
      min-width: max-content;
      align-items: stretch;
    }
    .card {
      appearance: none;
      font: inherit;
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      background: rgba(253, 254, 253, 0.86);
      min-width: 240px;
      max-width: 240px;
      padding: 8px 10px;
      display: grid;
      gap: 6px;
      text-align: left;
      color: inherit;
      cursor: pointer;
      transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 160ms ease, border-color 160ms ease;
    }
    .card:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 18px rgba(17, 26, 23, 0.08);
      border-color: var(--mint-strong);
    }
    .card:focus-visible {
      outline: 2px solid var(--mint-strong);
      outline-offset: 2px;
    }
    .card.active {
      border-color: var(--mint-strong);
      box-shadow: 0 0 0 1px rgba(46, 69, 57, 0.22), 0 10px 20px rgba(17, 26, 23, 0.08);
      background: var(--surface-1);
    }
    .head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }
    .title {
      font-size: 11px;
      color: var(--text-primary);
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .status {
      font-size: 10px;
      border-radius: 999px;
      padding: 2px 8px;
      border: 1px solid var(--border-strong);
      color: var(--text-secondary);
      background: rgba(253, 254, 253, 0.85);
      text-transform: uppercase;
      letter-spacing: 0.07em;
      white-space: nowrap;
    }
    .status.running {
      border-color: var(--mint-strong);
      color: var(--dark);
      background: color-mix(in srgb, var(--accent-subtle) 84%, transparent);
    }
    .status.completed {
      border-color: rgba(46, 125, 50, 0.25);
      color: #2e7d32;
      background: rgba(46, 125, 50, 0.08);
    }
    .status.failed {
      border-color: rgba(192, 57, 43, 0.26);
      color: var(--danger);
      background: var(--danger-subtle);
    }
    .meta {
      font-size: 11px;
      color: var(--text-tertiary);
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .counts {
      font-size: 11px;
      color: var(--text-secondary);
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .count {
      border-radius: 999px;
      border: 1px solid var(--border-divider);
      background: var(--surface-2);
      padding: 2px 8px;
      white-space: nowrap;
    }
    .count.warn {
      border-color: rgba(120, 75, 24, 0.24);
      color: #784b18;
      background: rgba(120, 75, 24, 0.09);
    }
    .count.fail {
      border-color: rgba(192, 57, 43, 0.24);
      color: var(--danger);
      background: var(--danger-subtle);
    }
    .empty {
      color: var(--text-tertiary);
      font-size: 11px;
      padding: 2px 0;
    }
  `;

  @property({ attribute: false }) orchestrations: SwarmOrchestrationSummary[] = [];
  @property() activeOrchestrationId = "";
  @property({ type: Boolean }) loading = false;

  private emitSelect(orchestrationId: string) {
    this.dispatchEvent(
      new CustomEvent("orchestration-select", {
        detail: orchestrationId,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private fmtTime(iso: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return iso;
    return at.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  render() {
    if (this.orchestrations.length === 0) {
      return html`<div class="empty">${this.loading ? "Loading orchestrations..." : "No orchestration history yet."}</div>`;
    }

    return html`
      <div class="row">
        ${this.orchestrations.slice(0, 10).map((orchestration) => {
          const pending = orchestration.pendingNodes.length;
          const failed = orchestration.failedNodes.length;
          const blocked = orchestration.blockedNodes.length;
          return html`
            <button
              type="button"
              class="card ${this.activeOrchestrationId === orchestration.orchestrationId ? "active" : ""}"
              @click=${() => this.emitSelect(orchestration.orchestrationId)}
            >
              <div class="head">
                <span class="title">${orchestration.orchestrationId.slice(0, 8)}</span>
                <span class="status ${orchestration.status}">${orchestration.status}</span>
              </div>
              <div class="meta">
                <span>${this.fmtTime(orchestration.startedAt)}</span>
                ${orchestration.completedAt ? html`<span>done ${this.fmtTime(orchestration.completedAt)}</span>` : nothing}
              </div>
              <div class="counts">
                <span class="count">${orchestration.launched.length} launched</span>
                <span class="count">${orchestration.skipped.length} skipped</span>
                <span class="count ${pending > 0 ? "warn" : ""}">${pending} pending</span>
                <span class="count ${blocked > 0 ? "warn" : ""}">${blocked} blocked</span>
                <span class="count ${failed > 0 ? "fail" : ""}">${failed} failed</span>
              </div>
            </button>
          `;
        })}
      </div>
    `;
  }
}
