import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api, streamEvents, type RunItem } from "../api/client.js";

@customElement("run-detail")
export class RunDetail extends LitElement {
  static styles = css`
    :host { display: block; }
    .header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
    .back {
      background: var(--bg-card); color: var(--text-muted); border: 1px solid var(--border);
    }
    .back:hover { background: var(--bg-hover); color: var(--text); }
    h2 { font-size: 20px; font-weight: 600; flex: 1; }
    .status {
      display: inline-block; padding: 4px 12px; border-radius: 12px;
      font-size: 13px; font-weight: 500;
    }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
    .meta-card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 16px;
    }
    .meta-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
    .meta-value { font-size: 16px; font-weight: 500; }
    .actions { display: flex; gap: 8px; margin-bottom: 24px; }
    .btn { padding: 8px 16px; border-radius: var(--radius); font-size: 13px; font-weight: 500; }
    .btn-approve { background: var(--success); color: white; }
    .btn-approve:hover { opacity: 0.9; }
    .btn-reject { background: var(--danger); color: white; }
    .btn-reject:hover { opacity: 0.9; }
    .btn-action { background: var(--bg-card); color: var(--text); border: 1px solid var(--border); }
    .btn-action:hover { background: var(--bg-hover); }
    .events {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 16px; max-height: 400px;
      overflow-y: auto; font-family: var(--mono); font-size: 13px;
    }
    .event-line { padding: 4px 0; border-bottom: 1px solid var(--border); }
    .event-type { color: var(--accent); font-weight: 500; }
    .mono { font-family: var(--mono); font-size: 13px; }
    .empty-events { color: var(--text-muted); text-align: center; padding: 24px; }
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
