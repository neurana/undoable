import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { api, streamEvents, type RunItem } from "../api/client.js";

type RunEvent = { type: string; ts?: string; payload?: Record<string, unknown> };

@customElement("run-detail")
export class RunDetail extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; box-sizing: border-box; }
    .header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); flex-wrap: wrap; }
    .back {
      background: var(--surface-1); color: var(--text-secondary);
      border: 1px solid var(--border-strong); border-radius: var(--radius-pill);
      padding: 6px 14px; font-size: 12px; cursor: pointer;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .back:hover { background: var(--wash); color: var(--text-primary); border-color: var(--mint-strong); }
    h2 { font-size: 18px; font-weight: 400; flex: 1; color: var(--text-primary); font-family: var(--font-serif); letter-spacing: -0.02em; }
    .status {
      display: inline-block; padding: 3px 12px; border-radius: var(--radius-pill);
      font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
    }
    .status-created { background: var(--wash); color: var(--text-tertiary); }
    .status-planning { background: var(--accent-subtle); color: var(--success); }
    .status-applying { background: var(--accent-subtle); color: var(--success); }
    .status-completed { background: var(--accent-subtle); color: var(--success); }
    .status-failed { background: var(--danger-subtle); color: var(--danger); }
    .status-cancelled, .status-paused { background: var(--wash); color: var(--text-tertiary); }
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
    .btn { padding: 7px 16px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 600; cursor: pointer; border: none; transition: all 180ms cubic-bezier(0.2,0.8,0.2,1); }
    .btn-approve { background: var(--dark); color: #FDFEFD; }
    .btn-approve:hover { background: var(--accent-hover); box-shadow: 0 4px 12px rgba(46,69,57,0.15); }
    .btn-reject { background: var(--danger-subtle); color: var(--danger); border: 1px solid rgba(192,57,43,0.15); }
    .btn-reject:hover { background: rgba(192,57,43,0.12); }
    .btn-action { background: var(--surface-1); color: var(--text-secondary); border: 1px solid var(--border-strong); }
    .btn-action:hover { background: var(--wash); border-color: var(--mint-strong); color: var(--text-primary); }

    .progress-bar {
      height: 4px; background: var(--wash); border-radius: 2px;
      margin-bottom: var(--space-3); overflow: hidden;
    }
    .progress-fill {
      height: 100%; background: var(--dark); border-radius: 2px;
      transition: width 300ms ease;
    }
    .progress-label {
      font-size: 11px; color: var(--text-tertiary); margin-bottom: 6px;
      display: flex; justify-content: space-between;
    }

    .output-panel {
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: var(--radius-md); margin-bottom: var(--space-3);
      box-shadow: var(--shadow-sm); overflow: hidden;
    }
    .output-header {
      padding: 10px 14px; font-size: 12px; font-weight: 600;
      color: var(--text-secondary); border-bottom: 1px solid var(--border-divider);
      background: var(--wash);
    }
    .output-content {
      padding: 14px; font-size: 13px; line-height: 1.6;
      color: var(--text-primary); white-space: pre-wrap;
      max-height: 300px; overflow-y: auto;
    }
    .output-content:empty::after {
      content: "Waiting for LLM response...";
      color: var(--text-tertiary); font-style: italic;
    }

    .tool-card {
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: var(--radius-md); margin-bottom: 8px;
      box-shadow: var(--shadow-sm); overflow: hidden;
    }
    .tool-header {
      padding: 8px 12px; font-size: 12px; font-weight: 600;
      display: flex; align-items: center; gap: 8px;
      background: var(--wash); color: var(--text-secondary);
    }
    .tool-icon { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; fill: none; }
    .tool-name { color: var(--dark); font-family: var(--mono); }
    .tool-step { font-size: 11px; color: var(--text-tertiary); margin-left: auto; }
    .tool-args {
      padding: 8px 12px; font-size: 11px; font-family: var(--mono);
      color: var(--text-tertiary); border-bottom: 1px solid var(--border-divider);
      max-height: 80px; overflow-y: auto; white-space: pre-wrap;
    }
    .tool-result {
      padding: 8px 12px; font-size: 11px; font-family: var(--mono);
      color: var(--text-secondary); max-height: 120px;
      overflow-y: auto; white-space: pre-wrap;
    }
    .tool-error { color: var(--danger); }

    .events-toggle {
      font-size: 12px; color: var(--text-tertiary); cursor: pointer;
      margin-bottom: 8px; display: flex; align-items: center; gap: 4px;
    }
    .events-toggle:hover { color: var(--text-secondary); }
    .events-raw {
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: var(--radius-md); padding: var(--space-2); max-height: 200px;
      overflow-y: auto; font-family: var(--mono); font-size: 11px;
      box-shadow: var(--shadow-sm);
    }
    .event-line { padding: 3px 0; border-bottom: 1px solid var(--border-divider); color: var(--text-tertiary); }
    .event-type { color: var(--dark); font-weight: 500; }
    .mono { font-family: var(--mono); font-size: 12px; color: var(--text-tertiary); }
    .empty-state { color: var(--text-tertiary); text-align: center; padding: var(--space-3); font-size: 13px; }

    .error-banner {
      background: var(--danger-subtle); border: 1px solid rgba(192,57,43,0.2);
      border-radius: var(--radius-md); padding: 12px 16px; margin-bottom: var(--space-3);
      color: var(--danger); font-size: 13px;
    }
    .warning-banner {
      background: var(--warning-subtle); border: 1px solid rgba(230,126,34,0.2);
      border-radius: var(--radius-md); padding: 12px 16px; margin-bottom: var(--space-3);
      color: var(--warning); font-size: 13px;
    }
    .scheduled-banner {
      background: rgba(109,40,217,0.06); border: 1px solid rgba(109,40,217,0.15);
      border-radius: var(--radius-md); padding: 10px 16px; margin-bottom: var(--space-3);
      color: #7c3aed; font-size: 12px; display: flex; align-items: center; gap: 8px;
    }
    .scheduled-banner svg { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; fill: none; flex-shrink: 0; }

    @media (max-width: 640px) {
      .header { gap: 8px; }
      h2 { font-size: 15px; min-width: 0; word-break: break-word; }
      .meta { grid-template-columns: 1fr; }
      .actions { flex-wrap: wrap; }
      .output-content { max-height: 200px; font-size: 12px; }
      .tool-args, .tool-result { font-size: 10px; }
    }
  `;

  @property() runId = "";
  @property() backLabel = "Back to Jobs";
  @state() private run: RunItem | null = null;
  @state() private events: RunEvent[] = [];
  @state() private streamedContent = "";
  @state() private toolCalls: Array<{ name: string; args: string; result?: string; error?: boolean; step?: string }> = [];
  @state() private iteration = 0;
  @state() private maxIterations = 0;
  @state() private errorMsg = "";
  @state() private warningMsg = "";
  @state() private showRawEvents = false;
  private unsub?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.loadRun();
    this.unsub = streamEvents(this.runId, (raw) => {
      const event = raw as RunEvent;
      this.events = [...this.events, event];
      this.handleEvent(event);
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsub?.();
  }

  private handleEvent(e: RunEvent) {
    const p = e.payload ?? {};
    switch (e.type) {
      case "STATUS_CHANGED":
        if (this.run && typeof p.status === "string") {
          this.run = { ...this.run, status: p.status };
        }
        break;
      case "ACTION_PROGRESS":
        if (typeof p.iteration === "number") this.iteration = p.iteration;
        if (typeof p.maxIterations === "number") this.maxIterations = p.maxIterations;
        break;
      case "LLM_TOKEN":
        if (typeof p.content === "string") this.streamedContent += p.content;
        break;
      case "LLM_THINKING":
        break;
      case "TOOL_CALL": {
        const step = typeof p.iteration === "number" && typeof p.maxIterations === "number"
          ? `${p.iteration}/${p.maxIterations}` : "";
        this.toolCalls = [...this.toolCalls, {
          name: String(p.name ?? ""),
          args: typeof p.args === "object" ? JSON.stringify(p.args, null, 2) : String(p.args ?? ""),
          step,
        }];
        break;
      }
      case "TOOL_RESULT": {
        const last = this.toolCalls.findLast((tc) => tc.name === String(p.name ?? "") && !tc.result);
        if (last) {
          const isError = typeof p.result === "object" && p.result !== null && "error" in (p.result as Record<string, unknown>);
          last.result = typeof p.result === "object" ? JSON.stringify(p.result, null, 2) : String(p.result ?? "");
          last.error = isError;
          this.toolCalls = [...this.toolCalls];
        }
        break;
      }
      case "RUN_COMPLETED":
        if (typeof p.content === "string" && p.content) {
          this.streamedContent = p.content;
        }
        break;
      case "RUN_FAILED":
        this.errorMsg = String(p.content ?? "Run failed");
        break;
      case "RUN_WARNING":
        this.warningMsg = String(p.content ?? "Warning");
        break;
    }
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

  private isActive(status: string) {
    return ["created", "planning", "applying"].includes(status);
  }

  render() {
    if (!this.run) return html`<p>Loading...</p>`;
    const r = this.run;
    const active = this.isActive(r.status);
    const progressPct = this.maxIterations > 0 ? Math.min(100, (this.iteration / this.maxIterations) * 100) : 0;

    return html`
      <div class="header">
        <button class="back" @click=${this.back}>← ${this.backLabel}</button>
        <h2>${r.instruction}</h2>
        <span class="status status-${r.status}">${r.status}</span>
      </div>

      ${r.userId === "scheduler" ? html`
        <div class="scheduled-banner">
          <svg viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          This run was triggered by a scheduled job
        </div>
      ` : nothing}
      ${this.errorMsg ? html`<div class="error-banner">${this.errorMsg}</div>` : nothing}
      ${this.warningMsg ? html`<div class="warning-banner">${this.warningMsg}</div>` : nothing}

      ${active && this.maxIterations > 0 ? html`
        <div class="progress-label">
          <span>Step ${this.iteration} of ${this.maxIterations}</span>
          <span>${r.status}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPct}%"></div>
        </div>
      ` : nothing}

      <div class="meta">
        <div class="meta-card">
          <div class="meta-label">Run ID</div>
          <div class="meta-value mono">${r.id.slice(0, 12)}</div>
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
        ${r.status === "approval_required" ? html`
          <button class="btn btn-approve" @click=${() => this.runAction("apply")}>Approve & Apply</button>
          <button class="btn btn-reject" @click=${() => this.runAction("cancel")}>Reject</button>
        ` : nothing}
        ${r.status === "applied" ? html`
          <button class="btn btn-action" @click=${() => this.runAction("undo")}>Undo</button>
        ` : nothing}
        ${active ? html`
          ${r.status !== "paused" ? html`
            <button class="btn btn-action" @click=${() => this.runAction("pause")}>Pause</button>
          ` : nothing}
          <button class="btn btn-reject" @click=${() => this.runAction("cancel")}>Cancel</button>
        ` : nothing}
        ${r.status === "paused" ? html`
          <button class="btn btn-action" @click=${() => this.runAction("resume")}>Resume</button>
        ` : nothing}
      </div>

      <div class="output-panel">
        <div class="output-header">
          LLM Output
          ${active ? html`<span style="float:right; opacity: 0.5;">streaming...</span>` : nothing}
        </div>
        <div class="output-content">${this.streamedContent}</div>
      </div>

      ${this.toolCalls.length > 0 ? html`
        <div style="margin-bottom: var(--space-3);">
          <div style="font-size: 13px; font-weight: 500; color: var(--text-secondary); margin-bottom: 8px;">
            Tool Calls (${this.toolCalls.length})
          </div>
          ${this.toolCalls.map((tc) => html`
            <div class="tool-card">
              <div class="tool-header">
                <svg class="tool-icon" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                <span class="tool-name">${tc.name}</span>
                ${tc.step ? html`<span class="tool-step">step ${tc.step}</span>` : nothing}
              </div>
              <div class="tool-args">${tc.args}</div>
              ${tc.result != null ? html`
                <div class="tool-result ${tc.error ? "tool-error" : ""}">${tc.result}</div>
              ` : html`<div class="tool-result" style="opacity:0.4;">executing...</div>`}
            </div>
          `)}
        </div>
      ` : nothing}

      <div class="events-toggle" @click=${() => this.showRawEvents = !this.showRawEvents}>
        ${this.showRawEvents ? "▾" : "▸"} Raw Events (${this.events.length})
      </div>
      ${this.showRawEvents ? html`
        <div class="events-raw">
          ${this.events.length === 0 ? html`<div class="empty-state">Waiting for events...</div>` : nothing}
          ${this.events.map((e) => html`
            <div class="event-line">
              <span class="event-type">${e.type}</span>
              <span style="margin-left: 8px;">${e.ts ?? ""}</span>
            </div>
          `)}
        </div>
      ` : nothing}
    `;
  }
}
