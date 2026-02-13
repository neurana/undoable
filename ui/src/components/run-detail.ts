import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api, streamEvents, type RunItem } from "../api/client.js";

@customElement("run-detail")
export class RunDetail extends LitElement {
  static styles = css`
    :host { display: block; }
    .header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); }
    .back {
      background: var(--surface-1); color: var(--text-secondary);
      border: 1px solid var(--border-strong); border-radius: var(--radius-pill);
      padding: 6px 14px; font-size: 12px;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .back:hover { background: var(--wash); color: var(--text-primary); border-color: var(--mint-strong); }
    h2 { font-size: 18px; font-weight: 400; flex: 1; color: var(--text-primary); font-family: var(--font-serif); letter-spacing: -0.02em; }
    .status {
      display: inline-block; padding: 3px 12px; border-radius: var(--radius-pill);
      font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
      background: var(--accent-subtle); color: var(--success);
    }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); margin-bottom: var(--space-3); }
    .meta-card {
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: var(--radius-md); padding: var(--space-2);
      box-shadow: var(--shadow-sm);
    }
    .meta-label {
      font-size: 11px; color: var(--text-tertiary); text-transform: uppercase;
      margin-bottom: 4px; letter-spacing: 0.4px; font-weight: 500;
    }
    .meta-value { font-size: 14px; font-weight: 500; color: var(--text-primary); }
    .actions { display: flex; gap: 8px; margin-bottom: var(--space-3); }
    .btn { padding: 7px 16px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 600; transition: all 180ms cubic-bezier(0.2,0.8,0.2,1); }
    .btn-approve { background: var(--dark); color: #FDFEFD; }
    .btn-approve:hover { background: var(--accent-hover); box-shadow: 0 4px 12px rgba(46,69,57,0.15); }
    .btn-reject { background: var(--danger-subtle); color: var(--danger); border: 1px solid rgba(192,57,43,0.15); }
    .btn-reject:hover { background: rgba(192,57,43,0.12); }
    .btn-action { background: var(--surface-1); color: var(--text-secondary); border: 1px solid var(--border-strong); }
    .btn-action:hover { background: var(--wash); border-color: var(--mint-strong); color: var(--text-primary); }
    .events {
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: var(--radius-md); padding: var(--space-2); max-height: 400px;
      overflow-y: auto; font-family: var(--mono); font-size: 12px;
      box-shadow: var(--shadow-sm);
    }
    .event-line { padding: 5px 0; border-bottom: 1px solid var(--border-divider); }
    .event-type { color: var(--dark); font-weight: 500; }
    .mono { font-family: var(--mono); font-size: 12px; color: var(--text-tertiary); }
    .empty-events { color: var(--text-tertiary); text-align: center; padding: var(--space-3); font-size: 13px; }
  `;

  @property() runId = "";
  @state() private run: RunItem | null = null;
  @state() private events: Array<{ type: string; ts: string; payload?: unknown }> = [];
  private unsub?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.loadRun();
    this.unsub = streamEvents(this.runId, (event) => {
      this.events = [...this.events, event as { type: string; ts: string }];
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsub?.();
  }

  private async loadRun() {
    try { this.run = await api.runs.get(this.runId); } catch {}
  }

  private async runAction(action: string) {
    try {
      this.run = await api.runs.action(this.runId, action);
    } catch {}
  }

  private back() {
    this.dispatchEvent(new CustomEvent("back", { bubbles: true, composed: true }));
  }

  render() {
    if (!this.run) return html`<p>Loading...</p>`;
    const r = this.run;
    const needsApproval = r.status === "approval_required";

    return html`
      <div class="header">
        <button class="back btn" @click=${this.back}>← Back</button>
        <h2>${r.instruction}</h2>
        <span class="status">${r.status}</span>
      </div>

      <div class="meta">
        <div class="meta-card">
          <div class="meta-label">Run ID</div>
          <div class="meta-value mono">${r.id}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Agent</div>
          <div class="meta-value">${r.agentId}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Created</div>
          <div class="meta-value mono">${new Date(r.createdAt).toLocaleString()}</div>
        </div>
      </div>

      <div class="actions">
        ${needsApproval ? html`
          <button class="btn btn-approve" @click=${() => this.runAction("apply")}>Approve & Apply</button>
          <button class="btn btn-reject" @click=${() => this.runAction("cancel")}>Reject</button>
        ` : ""}
        ${r.status === "applied" ? html`
          <button class="btn btn-action" @click=${() => this.runAction("undo")}>Undo</button>
        ` : ""}
        ${r.status !== "paused" && !["completed", "failed", "cancelled"].includes(r.status) ? html`
          <button class="btn btn-action" @click=${() => this.runAction("pause")}>Pause</button>
        ` : ""}
        ${r.status === "paused" ? html`
          <button class="btn btn-action" @click=${() => this.runAction("resume")}>Resume</button>
        ` : ""}
      </div>

      <h3 style="margin-bottom: 12px;">Live Events</h3>
      <div class="events">
        ${this.events.length === 0 ? html`<div class="empty-events">Waiting for events...</div>` : ""}
        ${this.events.map((e) => html`
          <div class="event-line">
            <span class="event-type">${e.type}</span>
            <span style="color: var(--text-muted); margin-left: 8px;">${e.ts ?? ""}</span>
          </div>
        `)}
      </div>
    `;
  }
}
