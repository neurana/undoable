import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

type View = "chat" | "runs" | "agents" | "users" | "jobs" | "skills";

@customElement("undoable-app")
export class UndoableApp extends LitElement {
  static styles = css`
    :host { display: flex; min-height: 100vh; width: 100%; }
    undoable-chat { flex: 1; min-width: 0; }

    main { flex: 1; display: flex; flex-direction: column; min-width: 0; }

    .page-header {
      height: 48px; padding: 0 20px;
      display: flex; align-items: center; gap: 12px;
      border-bottom: 1px solid var(--border-divider);
      background: var(--bg-base); flex-shrink: 0;
    }
    .btn-back {
      height: 28px; padding: 0 10px;
      border-radius: var(--radius-sm);
      background: transparent; color: var(--text-tertiary);
      font-size: 12px; font-weight: 500; border: none; cursor: pointer;
      display: flex; align-items: center; gap: 4px;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .btn-back:hover { background: var(--wash); color: var(--text-secondary); }
    .back-icon { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; fill: none; }
    .page-title {
      font-size: 16px; font-weight: 400; color: var(--text-primary);
      font-family: var(--font-serif);
      letter-spacing: -0.02em;
    }

    .page-content {
      flex: 1; overflow-y: auto;
      padding: var(--space-4);
      max-width: 960px;
      background: var(--bg-base);
    }
  `;

  @state() private view: View = "chat";
  @state() private selectedRunId: string | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("navigate", this.onNavigate as EventListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("navigate", this.onNavigate as EventListener);
  }

  private onNavigate = (e: CustomEvent<View>) => {
    this.view = e.detail;
    this.selectedRunId = null;
  };

  private selectRun(e: CustomEvent<string>) { this.selectedRunId = e.detail; }
  private backToList() { this.selectedRunId = null; }
  private goChat() {
    this.view = "chat";
    this.selectedRunId = null;
    if (window.location.pathname !== "/") window.history.pushState(null, "", "/");
  }

  render() {
    if (this.view === "chat") {
      return html`<undoable-chat></undoable-chat>`;
    }

    const titles: Record<string, string> = { runs: "Runs", agents: "Agents", users: "Users", jobs: "Scheduled Jobs", skills: "Skills" };

    return html`
      <main>
        <div class="page-header">
          <button class="btn-back" @click=${this.goChat}>
            <svg class="back-icon" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Chat
          </button>
          <span class="page-title">${titles[this.view] ?? ""}</span>
        </div>
        <div class="page-content">
          ${this.view === "runs" && !this.selectedRunId ? html`<run-list @select-run=${this.selectRun}></run-list>` : ""}
          ${this.view === "runs" && this.selectedRunId ? html`<run-detail .runId=${this.selectedRunId} @back=${this.backToList}></run-detail>` : ""}
          ${this.view === "agents" ? html`<agent-list></agent-list>` : ""}
          ${this.view === "users" ? html`<user-list></user-list>` : ""}
          ${this.view === "jobs" ? html`<job-list></job-list>` : ""}
          ${this.view === "skills" ? html`<skill-list></skill-list>` : ""}
        </div>
      </main>
    `;
  }
}
