import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import { streamEvents } from "../../api/client.js";

type RunEvent = { type: string; ts?: string; payload?: Record<string, unknown> };
type ToolCall = { name: string; args: string; result?: string; error?: boolean };

const TERMINAL_STATUSES = ["completed", "done", "success", "failed", "cancelled", "error"];

@customElement("swarm-activity-stream")
export class SwarmActivityStream extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      font-size: 12px;
    }
    :host([compact]) { font-size: 11px; }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border-divider);
      background: var(--surface-2);
      flex-shrink: 0;
    }
    .node-name {
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .status-chip {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--border-strong);
      background: var(--surface-1);
      color: var(--text-tertiary);
    }
    .status-chip.running {
      border-color: var(--mint-strong);
      background: color-mix(in srgb, var(--accent-subtle) 80%, transparent);
      color: var(--dark);
    }
    .status-chip.completed {
      border-color: rgba(46, 125, 50, 0.25);
      color: #2e7d32;
    }
    .status-chip.failed {
      border-color: rgba(192, 57, 43, 0.28);
      color: var(--danger);
    }
    .content {
      flex: 1 1 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
      min-height: 0;
    }
    .content::-webkit-scrollbar { width: 6px; }
    .content::-webkit-scrollbar-track { background: transparent; }
    .content::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
    .output {
      font-family: var(--mono);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.6;
      color: var(--text-secondary);
      font-size: 12px;
    }
    .waiting {
      color: var(--text-tertiary);
      font-style: italic;
    }
    .tools {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 10px;
      border-top: 1px solid var(--border-divider);
      background: var(--surface-2);
      flex-shrink: 0;
    }
    .tool {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      padding: 3px 8px;
      border-radius: 6px;
      background: var(--surface-1);
      border: 1px solid var(--border-divider);
      color: var(--text-tertiary);
    }
    .tool.running {
      border-color: var(--mint-strong);
      color: var(--dark);
    }
    .tool.completed { color: #2e7d32; }
    .tool.error { color: var(--danger); }
    .spinner {
      width: 10px;
      height: 10px;
      border: 2px solid var(--border-divider);
      border-top-color: var(--mint-strong);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;

  @property() runId = "";
  @property() nodeName = "";
  @property({ type: Boolean, reflect: true }) compact = false;
  @state() private streamedContent = "";
  @state() private toolCalls: ToolCall[] = [];
  @state() private status = "";
  @query(".content") private contentEl?: HTMLElement;
  private unsub?: () => void;
  private subscribedRunId = "";

  connectedCallback() {
    super.connectedCallback();
    this.subscribe();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.closeStream();
  }

  protected willUpdate(changed: PropertyValues) {
    if (changed.has("runId") && this.runId !== this.subscribedRunId) {
      this.closeStream();
      this.resetState();
      this.subscribe();
    }
  }

  protected updated() {
    this.scrollToBottom();
  }

  private subscribe() {
    if (!this.runId) return;
    this.subscribedRunId = this.runId;
    this.unsub = streamEvents(this.runId, (raw) => this.handleEvent(raw as RunEvent));
  }

  private closeStream() {
    this.unsub?.();
    this.unsub = undefined;
    this.subscribedRunId = "";
  }

  private resetState() {
    this.streamedContent = "";
    this.toolCalls = [];
    this.status = "";
  }

  private scrollToBottom() {
    if (!this.contentEl) return;
    this.contentEl.scrollTop = this.contentEl.scrollHeight;
  }

  private handleEvent(e: RunEvent) {
    const p = e.payload ?? {};
    switch (e.type) {
      case "STATUS_CHANGED":
        if (typeof p.status === "string") {
          this.status = p.status;
          if (TERMINAL_STATUSES.includes(p.status)) this.closeStream();
        }
        break;
      case "LLM_TOKEN":
        if (typeof p.content === "string") this.streamedContent += p.content;
        break;
      case "TOOL_CALL":
        this.toolCalls = [...this.toolCalls, {
          name: String(p.name ?? ""),
          args: typeof p.args === "object" ? JSON.stringify(p.args) : String(p.args ?? ""),
        }];
        break;
      case "TOOL_RESULT": {
        const last = this.toolCalls.findLast((tc) => tc.name === String(p.name ?? "") && !tc.result);
        if (last) {
          const isError = typeof p.result === "object" && p.result !== null && "error" in (p.result as Record<string, unknown>);
          last.result = typeof p.result === "object" ? JSON.stringify(p.result) : String(p.result ?? "");
          last.error = isError;
          this.toolCalls = [...this.toolCalls];
        }
        break;
      }
      case "RUN_COMPLETED":
        if (typeof p.content === "string" && p.content) this.streamedContent = p.content;
        this.status = "completed";
        this.closeStream();
        break;
      case "RUN_FAILED":
        this.status = "failed";
        this.closeStream();
        break;
    }
  }

  private statusClass(): string {
    if (["created", "planning", "applying", "running"].includes(this.status)) return "running";
    if (["completed", "done", "success"].includes(this.status)) return "completed";
    if (["failed", "cancelled", "error"].includes(this.status)) return "failed";
    return "";
  }

  render() {
    return html`
      <div class="header">
        <span class="node-name">${this.nodeName}</span>
        <span class="status-chip ${this.statusClass()}">${this.status || "connecting..."}</span>
      </div>
      <div class="content">
        ${this.streamedContent
          ? html`<div class="output">${this.streamedContent}</div>`
          : html`<div class="waiting">Waiting for AI response...</div>`}
      </div>
      ${this.toolCalls.length > 0 ? html`
        <div class="tools">
          ${this.toolCalls.map(tc => html`
            <span class="tool ${tc.result ? (tc.error ? 'error' : 'completed') : 'running'}">
              ${tc.result ? (tc.error ? '✗' : '✓') : html`<span class="spinner"></span>`}
              ${tc.name}
            </span>
          `)}
        </div>
      ` : nothing}
    `;
  }
}
