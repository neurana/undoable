import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

type View = "chat" | "agents" | "jobs" | "skills" | "nodes" | "channels" | "swarm";

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
      width: 100%; box-sizing: border-box;
      background: var(--bg-base);
    }

    @media (max-width: 640px) {
      .page-content { padding: var(--space-2); }
      .page-header { padding: 0 12px; }
      .page-title { font-size: 14px; }
    }
  `;

  private static VIEWS = new Set<View>(["chat", "agents", "jobs", "skills", "nodes", "channels", "swarm"]);

  @state() private view: View = "chat";

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("navigate", this.onNavigate as EventListener);
    window.addEventListener("popstate", this.onPopState);
    this.syncFromUrl();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("navigate", this.onNavigate as EventListener);
    window.removeEventListener("popstate", this.onPopState);
  }

  private syncFromUrl() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const first = parts[0] as View | undefined;
    if (first && UndoableApp.VIEWS.has(first)) {
      this.view = first;
    } else {
      this.view = "chat";
    }
  }

  private pushUrl(path: string) {
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
  }

  private onPopState = () => { this.syncFromUrl(); };

  private onNavigate = (e: CustomEvent<View>) => {
    this.view = e.detail;
    this.pushUrl(`/${e.detail}`);
  };

  private goChat() {
    this.view = "chat";
    this.pushUrl("/");
  }

  render() {
    if (this.view === "chat") {
      return html`<undoable-chat></undoable-chat>`;
    }

    const titles: Record<string, string> = {
      agents: "Agents",
      jobs: "Scheduled Jobs",
      skills: "Skills",
      nodes: "Nodes",
      channels: "Channels",
      swarm: "SWARM",
    };

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
          ${this.view === "agents" ? html`<agent-list></agent-list>` : ""}
          ${this.view === "jobs" ? html`<job-list></job-list>` : ""}
          ${this.view === "skills" ? html`<skill-list></skill-list>` : ""}
          ${this.view === "nodes" ? html`<undoable-nodes-panel></undoable-nodes-panel>` : ""}
          ${this.view === "channels" ? html`<channel-list></channel-list>` : ""}
          ${this.view === "swarm" ? html`<swarm-page></swarm-page>` : ""}
        </div>
      </main>
    `;
  }
}
