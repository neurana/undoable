import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

type View = "runs" | "agents" | "users";

@customElement("undoable-app")
export class UndoableApp extends LitElement {
  static styles = css`
    :host { display: flex; min-height: 100vh; }
    nav {
      width: 220px;
      background: var(--bg-card);
      border-right: 1px solid var(--border);
      padding: 24px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .logo {
      font-size: 18px;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 24px;
      letter-spacing: -0.5px;
    }
    .nav-item {
      padding: 10px 12px;
      border-radius: var(--radius);
      color: var(--text-muted);
      cursor: pointer;
      font-size: 14px;
      transition: all 0.15s;
    }
    .nav-item:hover { background: var(--bg-hover); color: var(--text); }
    .nav-item[data-active] { background: var(--accent); color: white; }
    main { flex: 1; padding: 32px; overflow-y: auto; }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 24px; }
  `;

  @state() private view: View = "runs";
  @state() private selectedRunId: string | null = null;

  private navigate(view: View) {
    this.view = view;
    this.selectedRunId = null;
  }

  private selectRun(e: CustomEvent<string>) {
    this.selectedRunId = e.detail;
  }

  private backToList() {
    this.selectedRunId = null;
  }

  render() {
    return html`
      <nav>
        <div class="logo">⟲ Undoable</div>
        <div class="nav-item" ?data-active=${this.view === "runs"} @click=${() => this.navigate("runs")}>Runs</div>
        <div class="nav-item" ?data-active=${this.view === "agents"} @click=${() => this.navigate("agents")}>Agents</div>
        <div class="nav-item" ?data-active=${this.view === "users"} @click=${() => this.navigate("users")}>Users</div>
      </nav>
      <main>
        ${this.view === "runs" && !this.selectedRunId ? html`
          <h1>Runs</h1>
          <run-list @select-run=${this.selectRun}></run-list>
        ` : ""}
        ${this.view === "runs" && this.selectedRunId ? html`
          <run-detail .runId=${this.selectedRunId} @back=${this.backToList}></run-detail>
        ` : ""}
        ${this.view === "agents" ? html`
          <h1>Agents</h1>
          <agent-list></agent-list>
        ` : ""}
        ${this.view === "users" ? html`
          <h1>Users</h1>
          <user-list></user-list>
        ` : ""}
      </main>
    `;
  }
}
