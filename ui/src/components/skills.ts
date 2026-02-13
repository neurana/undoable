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

type SkillFilter = "all" | "ready" | "needs-setup" | "disabled";

@customElement("skill-list")
export class SkillList extends LitElement {
  static styles = css`
    :host {
      display: block;
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
  `;

  @state() private skills: SkillItem[] = [];
  @state() private filter: SkillFilter = "all";
  @state() private loading = true;

  connectedCallback() {
    super.connectedCallback();
    this.fetchSkills();
  }

  private async fetchSkills() {
    this.loading = true;
    try {
      const res = await fetch("/api/skills");
      if (res.ok) {
        const data = await res.json() as { skills: SkillItem[] };
        this.skills = data.skills;
      }
    } catch { /* ignore */ }
    this.loading = false;
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
