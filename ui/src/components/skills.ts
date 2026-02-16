import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

type SkillItem = {
  name: string;
  description: string;
  emoji: string | null;
  homepage: string | null;
  source: string;
  filePath: string;
  eligible: boolean;
  disabled: boolean;
  missing: { bins: string[]; env: string[] };
  requires: { bins?: string[]; env?: string[] } | null;
};

type SkillsWarning = {
  title: string;
  message: string;
  docs: string[];
};

type SearchSkillItem = {
  reference: string;
  repo: string;
  skill: string;
  url: string;
  installCommand: string;
  recommended?: boolean;
};

type SkillsCliResult = {
  ok: boolean;
  command: string;
  message: string;
  warning?: SkillsWarning;
  stdout?: string;
  stderr?: string;
  entries?: string[];
};

type SkillFilter = "all" | "ready" | "needs-setup" | "disabled";

@customElement("skill-list")
export class SkillList extends LitElement {
  static styles = css`
    :host {
      display: block; width: 100%; box-sizing: border-box;
      color: var(--text-primary);
    }

    .skills-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .skills-header h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 400;
      font-family: var(--font-serif);
      letter-spacing: -0.02em;
    }
    .skills-header .count {
      font-size: 13px;
      color: var(--text-tertiary);
      font-weight: 400;
    }
    .header-spacer { flex: 1; }

    .filter-bar {
      display: flex;
      gap: 6px;
      margin-bottom: 16px;
    }
    .filter-btn {
      padding: 4px 12px;
      border-radius: var(--radius-sm, 12px);
      border: 1px solid var(--border-strong, #DCE6E3);
      background: transparent;
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .filter-btn:hover { background: var(--wash, #E6F0EC); }
    .filter-btn[data-active] {
      background: var(--wash-strong, #D9F3E6);
      color: var(--dark, #2E4539);
      border-color: var(--mint-strong, #ABCCBA);
    }

    .btn-refresh {
      padding: 4px 12px;
      border-radius: var(--radius-sm, 12px);
      border: 1px solid var(--border-strong, #DCE6E3);
      background: transparent;
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .btn-refresh:hover { background: var(--wash, #E6F0EC); }

    .danger-banner {
      border: 1px solid rgba(180, 83, 9, 0.35);
      background: var(--warning-subtle, rgba(180, 83, 9, 0.08));
      border-radius: var(--radius-md, 16px);
      padding: 12px 14px;
      margin-bottom: 12px;
    }
    .danger-title {
      font-size: 12px;
      font-weight: 700;
      color: #92400e;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 6px;
    }
    .danger-msg {
      font-size: 12px;
      color: #7c2d12;
      line-height: 1.4;
    }
    .danger-links {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .danger-links a {
      font-size: 11px;
      color: #7c2d12;
      text-decoration: underline;
    }

    .search-panel {
      border: 1px solid var(--border-strong, #DCE6E3);
      border-radius: var(--radius-md, 16px);
      padding: 12px;
      background: var(--surface-1, #FDFEFD);
      margin-bottom: 16px;
    }
    .search-title {
      margin: 0 0 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .search-subtitle {
      margin: 0 0 10px;
      font-size: 11px;
      color: var(--text-tertiary);
      line-height: 1.4;
    }
    .search-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 10px;
    }
    .search-input {
      flex: 1;
      min-width: 0;
      padding: 8px 10px;
      border-radius: var(--radius-sm, 12px);
      border: 1px solid var(--border-strong, #DCE6E3);
      background: var(--surface-1, #FDFEFD);
      color: var(--text-primary);
      font-size: 12px;
      outline: none;
    }
    .search-input:focus {
      border-color: var(--mint-strong, #ABCCBA);
      box-shadow: 0 0 0 3px var(--accent-glow, rgba(129, 205, 163, 0.16));
    }
    .btn-search {
      padding: 7px 12px;
      border-radius: var(--radius-sm, 12px);
      border: 1px solid var(--border-strong, #DCE6E3);
      background: var(--dark, #2E4539);
      color: #fff;
      font-size: 12px;
      cursor: pointer;
    }
    .btn-search:disabled { opacity: 0.55; cursor: not-allowed; }
    .search-error {
      margin-top: 6px;
      font-size: 11px;
      color: var(--danger, #C0392B);
    }
    .search-results {
      display: grid;
      gap: 8px;
    }
    .search-card {
      border: 1px solid var(--border-strong, #DCE6E3);
      border-radius: var(--radius-sm, 12px);
      padding: 10px;
      background: var(--wash, #E6F0EC);
    }
    .search-card-top {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: flex-start;
    }
    .search-ref {
      font-family: var(--mono);
      font-size: 11px;
      color: var(--text-primary);
      word-break: break-all;
    }
    .search-link {
      font-size: 11px;
      color: var(--text-secondary);
      text-decoration: underline;
      flex-shrink: 0;
    }
    .search-install-cmd {
      margin-top: 6px;
      font-family: var(--mono);
      font-size: 10px;
      color: var(--text-tertiary);
      word-break: break-word;
    }
    .search-actions {
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;
    }
    .btn-install {
      padding: 5px 10px;
      border-radius: var(--radius-sm, 12px);
      border: 1px solid var(--mint-strong, #ABCCBA);
      background: var(--surface-1, #FDFEFD);
      color: var(--text-primary);
      font-size: 11px;
      cursor: pointer;
    }
    .btn-install:disabled { opacity: 0.55; cursor: not-allowed; }

    .agent-panel {
      margin-bottom: 12px;
      padding: 10px;
      border: 1px dashed var(--border-strong, #DCE6E3);
      border-radius: var(--radius-sm, 12px);
      background: var(--wash, #E6F0EC);
    }
    .agent-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .agent-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 6px;
      margin-bottom: 8px;
    }
    .agent-opt {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .scope-row {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 11px;
      color: var(--text-tertiary);
    }
    .agent-warning {
      margin-top: 6px;
      font-size: 11px;
      color: var(--danger, #C0392B);
    }

    .cli-panel {
      border: 1px solid var(--border-strong, #DCE6E3);
      border-radius: var(--radius-md, 16px);
      padding: 12px;
      background: var(--surface-1, #FDFEFD);
      margin-bottom: 16px;
    }
    .cli-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 10px;
    }
    .btn-cli {
      padding: 6px 10px;
      border-radius: var(--radius-sm, 12px);
      border: 1px solid var(--border-strong, #DCE6E3);
      background: var(--surface-1, #FDFEFD);
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
    }
    .btn-cli:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-cli-danger {
      border-color: rgba(192,57,43,0.25);
      color: var(--danger, #C0392B);
      background: var(--danger-subtle, rgba(192,57,43,0.08));
    }
    .remove-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 10px;
    }
    .remove-input {
      flex: 1;
      min-width: 0;
      padding: 8px 10px;
      border-radius: var(--radius-sm, 12px);
      border: 1px solid var(--border-strong, #DCE6E3);
      background: var(--surface-1, #FDFEFD);
      font-size: 12px;
      color: var(--text-primary);
    }
    .entries-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }
    .entry-chip {
      padding: 3px 8px;
      border-radius: var(--radius-pill, 999px);
      border: 1px solid var(--border-strong, #DCE6E3);
      background: var(--wash, #E6F0EC);
      font-size: 10px;
      font-family: var(--mono);
      color: var(--text-secondary);
    }
    .cli-result {
      margin-top: 8px;
      border: 1px solid var(--border-strong, #DCE6E3);
      border-radius: var(--radius-sm, 12px);
      padding: 10px;
      background: var(--wash, #E6F0EC);
    }
    .cli-result.ok { border-color: rgba(46,125,86,0.25); }
    .cli-result.err { border-color: rgba(192,57,43,0.25); }
    .cli-meta {
      font-size: 11px;
      color: var(--text-secondary);
      margin-bottom: 6px;
      word-break: break-word;
    }
    .cli-command {
      font-family: var(--mono);
      font-size: 10px;
      color: var(--text-tertiary);
      margin-bottom: 6px;
      word-break: break-all;
    }
    .cli-output {
      margin: 0;
      white-space: pre-wrap;
      font-family: var(--mono);
      font-size: 10px;
      color: var(--text-tertiary);
      max-height: 220px;
      overflow: auto;
    }

    .skill-card {
      border: 1px solid var(--border-strong, #DCE6E3);
      border-radius: var(--radius-md, 16px);
      padding: 14px 16px;
      margin-bottom: 10px;
      background: var(--surface-1, #FDFEFD);
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
      box-shadow: var(--shadow-sm);
    }
    .skill-card:hover { border-color: var(--mint-strong, #ABCCBA); box-shadow: var(--shadow-card); }
    .skill-card.disabled { opacity: 0.5; }

    .skill-top {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .skill-emoji {
      font-size: 24px;
      line-height: 1;
      min-width: 28px;
      text-align: center;
    }
    .skill-info { flex: 1; min-width: 0; }
    .skill-name {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.2px;
    }
    .skill-desc {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 2px;
      line-height: 1.4;
    }

    .skill-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .badge-source {
      background: var(--wash, #E6F0EC);
      color: var(--text-tertiary);
    }
    .badge-eligible {
      background: var(--accent-subtle, rgba(174,231,199,0.22));
      color: var(--success, #2E7D56);
    }
    .badge-missing {
      background: var(--warning-subtle, rgba(184,134,11,0.08));
      color: var(--warning, #B8860B);
    }
    .badge-disabled {
      background: var(--danger-subtle, rgba(192,57,43,0.08));
      color: var(--danger, #C0392B);
    }

    .missing-detail {
      font-size: 11px;
      color: var(--text-tertiary);
      margin-top: 6px;
    }

    .skill-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .toggle-btn {
      width: 38px;
      height: 20px;
      border-radius: 10px;
      border: none;
      cursor: pointer;
      position: relative;
      transition: background 200ms ease;
      padding: 0;
    }
    .toggle-btn.on { background: var(--dark, #2E4539); }
    .toggle-btn.off { background: var(--border-strong, #DCE6E3); }
    .toggle-btn::after {
      content: "";
      position: absolute;
      top: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: white;
      transition: left 200ms ease;
    }
    .toggle-btn.on::after { left: 20px; }
    .toggle-btn.off::after { left: 2px; }

    .homepage-link {
      font-size: 11px;
      color: var(--dark, #2E4539);
      text-decoration: none;
    }
    .homepage-link:hover { text-decoration: underline; }

    .empty {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-tertiary);
      font-size: 14px;
    }

    .loading {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-tertiary);
      font-size: 13px;
    }

    @media (max-width: 640px) {
      .skills-header { flex-wrap: wrap; }
      .skills-header h2 { font-size: 18px; }
      .filter-bar { flex-wrap: wrap; }
      .skill-top { flex-direction: column; gap: 8px; }
      .skill-actions { align-self: flex-end; }
    }
  `;

  @state() private skills: SkillItem[] = [];
  @state() private filter: SkillFilter = "all";
  @state() private loading = true;
  @state() private warning: SkillsWarning | null = null;
  @state() private supportedAgents: string[] = [];
  @state() private selectedAgents = new Set<string>();
  @state() private globalScope = true;
  @state() private query = "find skills";
  @state() private searching = false;
  @state() private searchError = "";
  @state() private searchResults: SearchSkillItem[] = [];
  @state() private installInFlight = new Set<string>();
  @state() private cliBusy: "" | "list" | "check" | "update" | "remove" = "";
  @state() private cliResult: SkillsCliResult | null = null;
  @state() private installedEntries: string[] = [];
  @state() private removeInput = "";
  @state() private removeAll = false;

  connectedCallback() {
    super.connectedCallback();
    this.fetchSkills();
    void this.searchSkills();
  }

  private async fetchSkills() {
    this.loading = true;
    try {
      const res = await fetch("/api/skills");
      if (res.ok) {
        const data = await res.json() as {
          skills: SkillItem[];
          warning?: SkillsWarning;
          supportedAgents?: string[];
        };
        this.skills = data.skills;
        this.warning = data.warning ?? null;
        this.supportedAgents = Array.isArray(data.supportedAgents) ? data.supportedAgents : [];
      }
    } catch { /* ignore */ }
    this.loading = false;
  }

  private get selectedAgentTargets(): string[] {
    return [...this.selectedAgents];
  }

  private toggleAgentTarget(agent: string, checked: boolean) {
    const next = new Set(this.selectedAgents);
    if (checked) next.add(agent);
    else next.delete(agent);
    this.selectedAgents = next;
  }

  private async refreshInstalledEntries() {
    try {
      const res = await fetch("/api/skills/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          global: this.globalScope,
          agents: this.selectedAgentTargets,
        }),
      });
      const payload = await res.json() as SkillsCliResult;
      if (Array.isArray(payload.entries)) {
        this.installedEntries = payload.entries;
      }
    } catch {
      // ignore passive refresh errors
    }
  }

  private async runCli(action: "list" | "check" | "update" | "remove") {
    this.cliBusy = action;
    try {
      let res: Response;
      if (action === "list") {
        res = await fetch("/api/skills/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            global: this.globalScope,
            agents: this.selectedAgentTargets,
          }),
        });
      } else if (action === "check") {
        res = await fetch("/api/skills/check", { method: "POST" });
      } else if (action === "update") {
        res = await fetch("/api/skills/update", { method: "POST" });
      } else {
        const names = this.removeInput
          .split(/[\s,]+/)
          .map((row) => row.trim())
          .filter(Boolean);
        res = await fetch("/api/skills/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            all: this.removeAll,
            skills: names,
            global: this.globalScope,
            agents: this.selectedAgentTargets,
          }),
        });
      }

      const payload = await res.json() as SkillsCliResult;
      this.cliResult = payload;
      if (Array.isArray(payload.entries)) {
        this.installedEntries = payload.entries;
      }
      if (action === "update" || action === "remove") {
        await this.fetchSkills();
        if (action === "remove") {
          await this.refreshInstalledEntries();
        }
      }
    } catch (err) {
      this.cliResult = {
        ok: false,
        command: "",
        message: String(err),
      };
    }
    this.cliBusy = "";
  }

  private async searchSkills() {
    this.searching = true;
    this.searchError = "";
    try {
      const res = await fetch("/api/skills/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: this.query }),
      });
      const data = await res.json() as {
        ok: boolean;
        error?: string;
        warning?: SkillsWarning;
        results?: SearchSkillItem[];
      };
      this.warning = data.warning ?? this.warning;
      this.searchResults = data.results ?? [];
      if (!data.ok) {
        this.searchError = data.error ?? "skills search failed";
      }
    } catch (err) {
      this.searchError = String(err);
    }
    this.searching = false;
  }

  private async installRegistrySkill(reference: string) {
    if (this.installInFlight.has(reference)) return;
    if (this.selectedAgentTargets.length === 0) {
      this.searchError = "Select at least one target agent before installing.";
      return;
    }
    this.installInFlight = new Set(this.installInFlight).add(reference);
    try {
      const res = await fetch("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference,
          global: this.globalScope,
          agents: this.selectedAgentTargets,
        }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; warning?: SkillsWarning };
      this.warning = data.warning ?? this.warning;
      if (!res.ok || data.ok === false) {
        this.searchError = data.message ?? `install failed (HTTP ${res.status})`;
      } else {
        this.searchError = "";
        await this.fetchSkills();
        void this.runCli("list");
      }
    } catch (err) {
      this.searchError = String(err);
    }
    const next = new Set(this.installInFlight);
    next.delete(reference);
    this.installInFlight = next;
  }

  private async toggleSkill(name: string, currentlyDisabled: boolean) {
    try {
      const res = await fetch("/api/skills/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, enabled: currentlyDisabled }),
      });
      if (res.ok) await this.fetchSkills();
    } catch { /* ignore */ }
  }

  private async refreshSkills() {
    try {
      await fetch("/api/skills/refresh", { method: "POST" });
      await this.fetchSkills();
    } catch { /* ignore */ }
  }

  private get filtered(): SkillItem[] {
    switch (this.filter) {
      case "ready":
        return this.skills.filter((s) => s.eligible && !s.disabled);
      case "needs-setup":
        return this.skills.filter((s) => !s.eligible && !s.disabled);
      case "disabled":
        return this.skills.filter((s) => s.disabled);
      default:
        return this.skills;
    }
  }

  private sourceLabel(source: string): string {
    const m: Record<string, string> = { bundled: "Bundled", user: "User", workspace: "Workspace" };
    return m[source] ?? source;
  }

  render() {
    const eligible = this.skills.filter((s) => s.eligible).length;

    return html`
      <div class="skills-header">
        <h2>Skills <span class="count">${eligible}/${this.skills.length} active</span></h2>
        <div class="header-spacer"></div>
        <button class="btn-refresh" @click=${this.refreshSkills}>Refresh</button>
      </div>

      ${this.warning ? html`
        <div class="danger-banner">
          <div class="danger-title">${this.warning.title}</div>
          <div class="danger-msg">${this.warning.message}</div>
          <div class="danger-links">
            ${this.warning.docs.map((doc) => html`<a href=${doc} target="_blank" rel="noopener">${doc}</a>`)}
          </div>
        </div>
      ` : nothing}

      <div class="search-panel">
        <h3 class="search-title">Discover skills from skills.sh</h3>
        <p class="search-subtitle">
          Search the skills.sh registry and install skills into your environment. Recommended starter:
          <strong>vercel-labs/skills@find-skills</strong>.
        </p>
        <div class="agent-panel">
          <div class="agent-title">Target agents for install/list/remove</div>
          <div class="agent-grid">
            ${this.supportedAgents.map((agent) => html`
              <label class="agent-opt">
                <input
                  type="checkbox"
                  .checked=${this.selectedAgents.has(agent)}
                  @change=${(e: Event) => this.toggleAgentTarget(agent, (e.target as HTMLInputElement).checked)}
                >
                ${agent}
              </label>
            `)}
          </div>
          <div class="scope-row">
            <label class="agent-opt" style="font-size:11px">
              <input
                type="checkbox"
                .checked=${this.globalScope}
                @change=${(e: Event) => { this.globalScope = (e.target as HTMLInputElement).checked; }}
              >
              Use global scope (-g)
            </label>
          </div>
          ${this.selectedAgentTargets.length === 0 ? html`
            <div class="agent-warning">No target agents selected. Install will be blocked until you select at least one.</div>
          ` : nothing}
        </div>
        <div class="search-row">
          <input
            class="search-input"
            placeholder="e.g. testing, deployment, changelog"
            .value=${this.query}
            @input=${(e: Event) => { this.query = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void this.searchSkills();
              }
            }}
          >
          <button class="btn-search" @click=${this.searchSkills} ?disabled=${this.searching}>
            ${this.searching ? "Searching..." : "Search"}
          </button>
        </div>
        ${this.searchError ? html`<div class="search-error">${this.searchError}</div>` : nothing}
        ${this.searchResults.length > 0 ? html`
          <div class="search-results">
            ${this.searchResults.map((row) => html`
              <div class="search-card">
                <div class="search-card-top">
                  <div>
                    <div class="search-ref">${row.reference}</div>
                    ${row.recommended ? html`<span class="badge badge-eligible" style="margin-top:4px">Recommended</span>` : nothing}
                  </div>
                  <a class="search-link" href=${row.url} target="_blank" rel="noopener">View</a>
                </div>
                <div class="search-install-cmd">${row.installCommand}</div>
                <div class="search-actions">
                  <button
                    class="btn-install"
                    @click=${() => this.installRegistrySkill(row.reference)}
                    ?disabled=${this.installInFlight.has(row.reference)}
                  >
                    ${this.installInFlight.has(row.reference) ? "Installing..." : "Install"}
                  </button>
                </div>
              </div>
            `)}
          </div>
        ` : nothing}
      </div>

      <div class="cli-panel">
        <h3 class="search-title">Installed Skills (CLI)</h3>
        <p class="search-subtitle">Run list/check/update/remove using the skills CLI directly.</p>
        <div class="cli-actions">
          <button class="btn-cli" @click=${() => this.runCli("list")} ?disabled=${this.cliBusy !== ""}>
            ${this.cliBusy === "list" ? "Listing..." : "List"}
          </button>
          <button class="btn-cli" @click=${() => this.runCli("check")} ?disabled=${this.cliBusy !== ""}>
            ${this.cliBusy === "check" ? "Checking..." : "Check"}
          </button>
          <button class="btn-cli" @click=${() => this.runCli("update")} ?disabled=${this.cliBusy !== ""}>
            ${this.cliBusy === "update" ? "Updating..." : "Update"}
          </button>
        </div>

        ${this.installedEntries.length > 0 ? html`
          <div class="entries-list">
            ${this.installedEntries.map((entry) => html`<span class="entry-chip">${entry}</span>`)}
          </div>
        ` : nothing}

        <div class="remove-row">
          <input
            class="remove-input"
            placeholder="skills to remove (comma or space separated)"
            .value=${this.removeInput}
            @input=${(e: Event) => { this.removeInput = (e.target as HTMLInputElement).value; }}
          >
          <label class="agent-opt" style="font-size:11px;white-space:nowrap">
            <input
              type="checkbox"
              .checked=${this.removeAll}
              @change=${(e: Event) => { this.removeAll = (e.target as HTMLInputElement).checked; }}
            >
            Remove all
          </label>
          <button class="btn-cli btn-cli-danger" @click=${() => this.runCli("remove")} ?disabled=${this.cliBusy !== ""}>
            ${this.cliBusy === "remove" ? "Removing..." : "Remove"}
          </button>
        </div>

        ${this.cliResult ? html`
          <div class="cli-result ${this.cliResult.ok ? "ok" : "err"}">
            <div class="cli-meta">${this.cliResult.message}</div>
            ${this.cliResult.command ? html`<div class="cli-command">${this.cliResult.command}</div>` : nothing}
            ${(this.cliResult.stdout || this.cliResult.stderr) ? html`
              <pre class="cli-output">${`${this.cliResult.stdout ?? ""}${this.cliResult.stderr ? `\n${this.cliResult.stderr}` : ""}`}</pre>
            ` : nothing}
          </div>
        ` : nothing}
      </div>

      <div class="filter-bar">
        ${(["all", "ready", "needs-setup", "disabled"] as SkillFilter[]).map((f) => html`
          <button class="filter-btn" ?data-active=${this.filter === f}
            @click=${() => this.filter = f}>${f === "needs-setup" ? "Needs Setup" : f.charAt(0).toUpperCase() + f.slice(1)}</button>
        `)}
      </div>

      ${this.loading ? html`<div class="loading">Loading skills...</div>` : nothing}

      ${!this.loading && this.filtered.length === 0 ? html`
        <div class="empty">
          ${this.skills.length === 0
            ? "No skills found. Add SKILL.md files to ~/.undoable/skills/ or your workspace."
            : "No skills match this filter."}
        </div>
      ` : nothing}

      ${this.filtered.map((s) => html`
        <div class="skill-card ${s.disabled ? "disabled" : ""}">
          <div class="skill-top">
            <span class="skill-emoji">${s.emoji ?? "✨"}</span>
            <div class="skill-info">
              <div class="skill-name">${s.name}</div>
              <div class="skill-desc">${s.description}</div>
              <div class="skill-meta">
                <span class="badge badge-source">${this.sourceLabel(s.source)}</span>
                ${s.disabled ? html`<span class="badge badge-disabled">Disabled</span>`
                  : s.eligible ? html`<span class="badge badge-eligible">Ready</span>`
                    : html`<span class="badge badge-missing">Needs Setup</span>`}
                ${s.homepage ? html`<a class="homepage-link" href=${s.homepage} target="_blank" rel="noopener">Website</a>` : nothing}
              </div>
              ${!s.eligible && !s.disabled && (s.missing.bins.length > 0 || s.missing.env.length > 0) ? html`
                <div class="missing-detail">
                  ${s.missing.bins.length > 0 ? html`Missing binaries: ${s.missing.bins.join(", ")}. ` : nothing}
                  ${s.missing.env.length > 0 ? html`Missing env: ${s.missing.env.join(", ")}` : nothing}
                </div>
              ` : nothing}
            </div>
            <div class="skill-actions">
              <button class="toggle-btn ${s.disabled ? "off" : "on"}"
                @click=${() => this.toggleSkill(s.name, s.disabled)}
                title=${s.disabled ? "Enable" : "Disable"}></button>
            </div>
          </div>
        </div>
      `)}
    `;
  }
}
