import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, type AgentItem } from "../api/client.js";

@customElement("agent-list")
export class AgentList extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; box-sizing: border-box; }
    .toolbar { display: flex; gap: 12px; margin-bottom: var(--space-3); align-items: center; }
    .btn-primary {
      background: var(--dark); color: #FDFEFD; font-weight: 600;
      border-radius: var(--radius-pill); padding: 8px 18px; font-size: 12px;
      border: none; cursor: pointer;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .btn-primary:hover { background: var(--accent-hover); box-shadow: 0 4px 12px rgba(46,69,57,0.2); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-2); }
    .card {
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: var(--radius-md); padding: var(--space-3);
      box-shadow: var(--shadow-sm);
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .card:hover { border-color: var(--mint-strong); background: var(--bg-deep); box-shadow: var(--shadow-card); }
    .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .agent-name { font-size: 14px; font-weight: 600; color: var(--text-primary); flex: 1; }
    .badge {
      font-size: 10px; padding: 2px 8px; border-radius: var(--radius-pill);
      background: var(--accent-subtle); color: var(--success); font-weight: 600;
    }
    .detail { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; }
    .mono { font-family: var(--mono); color: var(--text-secondary); }
    .empty { text-align: center; padding: 48px; color: var(--text-tertiary); font-size: 13px; }
    .card-actions { display: flex; gap: 6px; }
    .btn-sm {
      background: none; border: 1px solid var(--border-strong); color: var(--text-tertiary);
      border-radius: var(--radius-sm); padding: 3px 10px; font-size: 11px;
      cursor: pointer; transition: all 120ms ease;
    }
    .btn-sm:hover { border-color: var(--mint-strong); color: var(--text-primary); background: var(--wash); }
    .btn-danger { border-color: rgba(192,57,43,0.2); color: var(--danger); }
    .btn-danger:hover { background: var(--danger-subtle); border-color: var(--danger); }
    .skill-tag {
      display: inline-block; padding: 1px 8px; border-radius: var(--radius-pill);
      font-size: 10px; background: var(--wash); color: var(--text-tertiary);
      margin: 2px 2px 0 0;
    }

    .form-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .form-panel {
      background: var(--bg-base); border: 1px solid var(--border-strong);
      border-radius: var(--radius-lg); padding: var(--space-4);
      width: 520px; max-width: 90vw; max-height: 90vh; overflow-y: auto;
      box-shadow: var(--shadow-card);
    }
    .form-title { font-size: 16px; font-weight: 500; color: var(--text-primary); margin-bottom: var(--space-3); font-family: var(--font-serif); }
    .form-field { margin-bottom: var(--space-2); }
    .form-label { font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; display: block; }
    .form-input {
      width: 100%; padding: 8px 12px; border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm); background: var(--surface-1);
      color: var(--text-primary); font-size: 13px; outline: none;
      box-sizing: border-box;
      transition: border-color 180ms ease;
    }
    .form-input:focus { border-color: var(--mint-strong); }
    .form-select {
      width: 100%; padding: 8px 12px; border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm); background: var(--surface-1);
      color: var(--text-primary); font-size: 13px; outline: none;
      box-sizing: border-box; cursor: pointer;
      transition: border-color 180ms ease;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 10px center;
    }
    .form-select:focus { border-color: var(--mint-strong); }
    .form-textarea {
      width: 100%; padding: 8px 12px; border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm); background: var(--surface-1);
      color: var(--text-primary); font-size: 13px; outline: none;
      box-sizing: border-box; resize: vertical; min-height: 100px;
      font-family: var(--mono); line-height: 1.5;
      transition: border-color 180ms ease;
    }
    .form-textarea:focus { border-color: var(--mint-strong); }
    .form-hint { font-size: 10px; color: var(--text-tertiary); margin-top: 3px; }
    .version-toggle {
      font-size: 11px; color: var(--text-tertiary); cursor: pointer;
      background: none; border: none; padding: 0; margin-top: 6px;
      text-decoration: underline; transition: color 120ms ease;
    }
    .version-toggle:hover { color: var(--text-primary); }
    .version-list {
      margin-top: 8px; border: 1px solid var(--border-divider);
      border-radius: var(--radius-sm); max-height: 160px; overflow-y: auto;
    }
    .version-item {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 10px; font-size: 11px;
      border-bottom: 1px solid var(--border-divider);
      transition: background 120ms ease;
    }
    .version-item:last-child { border-bottom: none; }
    .version-item:hover { background: var(--wash); }
    .version-item .v-label { font-weight: 600; color: var(--text-primary); min-width: 28px; }
    .version-item .v-date { color: var(--text-tertiary); flex: 1; }
    .version-item .v-summary { color: var(--text-secondary); font-style: italic; flex: 1; }
    .version-item .v-current { font-size: 9px; color: var(--success); font-weight: 600; }
    .btn-revert {
      background: none; border: 1px solid var(--border-strong); color: var(--text-tertiary);
      border-radius: var(--radius-sm); padding: 1px 6px; font-size: 10px;
      cursor: pointer; transition: all 120ms ease;
    }
    .btn-revert:hover { border-color: var(--mint-strong); color: var(--text-primary); background: var(--wash); }
    .form-row { display: flex; gap: 12px; }
    .form-row .form-field { flex: 1; }
    .form-check { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
    .form-check input { accent-color: var(--dark); }
    .form-check label { font-size: 12px; color: var(--text-secondary); }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: var(--space-3); }
    .btn-cancel {
      background: var(--surface-1); color: var(--text-secondary); border: 1px solid var(--border-strong);
      border-radius: var(--radius-pill); padding: 7px 16px; font-size: 12px;
      cursor: pointer; transition: all 120ms ease;
    }
    .btn-cancel:hover { background: var(--wash); }

    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
      .form-panel { width: 100%; padding: var(--space-3); }
      .form-row { flex-direction: column; gap: 0; }
      .toolbar { flex-wrap: wrap; }
    }
  `;

  @state() private agents: AgentItem[] = [];
  @state() private showForm = false;
  @state() private editingId: string | null = null;
  @state() private formId = "";
  @state() private formName = "";
  @state() private formModel = "";
  @state() private formInstructions = "";
  @state() private formSkills = "";
  @state() private availableModels: Array<{ provider: string; id: string; name: string }> = [];
  @state() private modelsLoaded = false;
  @state() private formDocker = false;
  @state() private formNetwork = false;
  @state() private formBrowser = false;
  @state() private formDefault = false;
  @state() private formError = "";
  @state() private versions: Array<{ version: number; createdAt: number; summary?: string }> = [];
  @state() private currentVersion = 0;
  @state() private showVersions = false;

  connectedCallback() {
    super.connectedCallback();
    this.loadAgents();
    this.loadModels();
  }

  private async loadModels() {
    try {
      const res = await fetch("/api/chat/models");
      if (res.ok) {
        const data = await res.json() as { models: Array<{ provider: string; id: string; name: string }> };
        this.availableModels = data.models;
      }
    } catch { /* ignore */ }
    this.modelsLoaded = true;
  }

  private async loadAgents() {
    try { this.agents = await api.agents.list(); } catch { this.agents = []; }
  }

  private openCreate() {
    this.editingId = null;
    this.formId = "";
    this.formName = "";
    this.formModel = this.availableModels.length > 0 ? this.availableModels[0]!.id : "gpt-4.1-mini";
    this.formInstructions = "";
    this.formSkills = "";
    this.formDocker = false;
    this.formNetwork = false;
    this.formBrowser = false;
    this.formDefault = false;
    this.formError = "";
    this.showForm = true;
  }

  private openEdit(agent: AgentItem) {
    this.editingId = agent.id;
    this.formId = agent.id;
    this.formName = agent.name ?? agent.id;
    this.formModel = agent.model;
    this.formInstructions = agent.instructions ?? "";
    this.formSkills = agent.skills?.join(", ") ?? "";
    this.formDocker = agent.sandbox?.docker ?? false;
    this.formNetwork = agent.sandbox?.network ?? false;
    this.formBrowser = agent.sandbox?.browser ?? false;
    this.formDefault = agent.default ?? false;
    this.formError = "";
    this.showVersions = false;
    this.versions = [];
    this.currentVersion = 0;
    this.showForm = true;
    this.loadVersions(agent.id);
  }

  private async loadVersions(agentId: string) {
    try {
      const res = await fetch(`/api/agents/${agentId}/instructions/versions`);
      if (res.ok) {
        const data = await res.json() as { currentVersion: number; versions: Array<{ version: number; createdAt: number; summary?: string }> };
        this.versions = data.versions;
        this.currentVersion = data.currentVersion;
      }
    } catch { /* ignore */ }
  }

  private async revertVersion(agentId: string, version: number) {
    try {
      const res = await fetch(`/api/agents/${agentId}/instructions/versions/${version}/revert`, { method: "POST" });
      if (res.ok) {
        const content = await fetch(`/api/agents/${agentId}/instructions`);
        if (content.ok) {
          const data = await content.json() as { content: string; version: number };
          this.formInstructions = data.content;
        }
        await this.loadVersions(agentId);
      }
    } catch { /* ignore */ }
  }

  private async submitForm() {
    if (!this.formId.trim() || !this.formModel.trim()) {
      this.formError = "ID and Model are required";
      return;
    }
    const skills = this.formSkills.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      if (this.editingId) {
        await api.agents.update(this.editingId, {
          name: this.formName || this.formId,
          model: this.formModel,
          instructions: this.formInstructions || undefined,
          skills,
          sandbox: { docker: this.formDocker, network: this.formNetwork, browser: this.formBrowser },
          default: this.formDefault,
        });
      } else {
        await api.agents.create({
          id: this.formId,
          name: this.formName || this.formId,
          model: this.formModel,
          instructions: this.formInstructions || undefined,
          skills,
          sandbox: { docker: this.formDocker, network: this.formNetwork, browser: this.formBrowser },
          default: this.formDefault,
        });
      }
      this.showForm = false;
      await this.loadAgents();
    } catch (e) {
      this.formError = String(e);
    }
  }

  private async deleteAgent(id: string) {
    try {
      await api.agents.delete(id);
      await this.loadAgents();
    } catch {}
  }

  render() {
    return html`
      <div class="toolbar">
        <button class="btn-primary" @click=${this.openCreate}>+ New Agent</button>
      </div>

      ${this.agents.length === 0 ? html`<div class="empty">No agents configured. Create one to get started.</div>` : html`
        <div class="grid">
          ${this.agents.map((a) => html`
            <div class="card">
              <div class="card-header">
                <span class="agent-name">${a.name ?? a.id}</span>
                ${a.default ? html`<span class="badge">default</span>` : nothing}
                <div class="card-actions">
                  <button class="btn-sm" @click=${() => this.openEdit(a)}>Edit</button>
                  <button class="btn-sm btn-danger" @click=${() => this.deleteAgent(a.id)}>Delete</button>
                </div>
              </div>
              <div class="detail">ID: <span class="mono">${a.id}</span></div>
              <div class="detail">Model: <span class="mono">${a.model}</span></div>
              ${a.instructions ? html`
                <div class="detail" style="margin-top: 6px; font-style: italic;">
                  ${a.instructions.length > 80 ? a.instructions.slice(0, 80) + "…" : a.instructions}
                </div>
              ` : nothing}
              ${a.skills && a.skills.length > 0 ? html`
                <div class="detail" style="margin-top: 6px;">
                  Skills: ${a.skills.map((s) => html`<span class="skill-tag">${s}</span>`)}
                </div>
              ` : nothing}
              <div class="detail" style="margin-top: 6px;">
                Sandbox:
                ${a.sandbox?.docker ? html`<span class="skill-tag">docker</span>` : nothing}
                ${a.sandbox?.network ? html`<span class="skill-tag">network</span>` : nothing}
                ${a.sandbox?.browser ? html`<span class="skill-tag">browser</span>` : nothing}
                ${!a.sandbox?.docker && !a.sandbox?.network && !a.sandbox?.browser ? html`<span style="color:var(--text-tertiary); font-size:11px;">none</span>` : nothing}
              </div>
            </div>
          `)}
        </div>
      `}

      ${this.showForm ? html`
        <div class="form-overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this.showForm = false; }}>
          <div class="form-panel">
            <div class="form-title">${this.editingId ? "Edit Agent" : "Create Agent"}</div>
            ${this.formError ? html`<div style="color: var(--danger); font-size: 12px; margin-bottom: 8px;">${this.formError}</div>` : nothing}

            <div class="form-row">
              <div class="form-field">
                <label class="form-label">ID</label>
                <input class="form-input" .value=${this.formId} ?disabled=${!!this.editingId}
                  @input=${(e: InputEvent) => this.formId = (e.target as HTMLInputElement).value}
                  placeholder="e.g. code-review" />
              </div>
              <div class="form-field">
                <label class="form-label">Name</label>
                <input class="form-input" .value=${this.formName}
                  @input=${(e: InputEvent) => this.formName = (e.target as HTMLInputElement).value}
                  placeholder="Display name" />
              </div>
            </div>

            <div class="form-field">
              <label class="form-label">Model</label>
              ${this.availableModels.length > 0 ? html`
                <select class="form-select"
                  @change=${(e: Event) => this.formModel = (e.target as HTMLSelectElement).value}>
                  ${this.availableModels.map((m) => html`
                    <option value=${m.id} ?selected=${m.id === this.formModel}>
                      ${m.name || m.id} (${m.provider})
                    </option>
                  `)}
                </select>
              ` : html`
                <input class="form-input" .value=${this.formModel}
                  @input=${(e: InputEvent) => this.formModel = (e.target as HTMLInputElement).value}
                  placeholder="e.g. gpt-4.1-mini" />
              `}
            </div>

            <div class="form-field">
              <label class="form-label">Training / Instructions</label>
              <textarea class="form-textarea" .value=${this.formInstructions}
                @input=${(e: InputEvent) => this.formInstructions = (e.target as HTMLTextAreaElement).value}
                placeholder="Write training instructions for this agent. This will be passed as a system prompt to the model.
Example: You are a code review expert. Focus on security, performance, and maintainability."></textarea>
              <div class="form-hint">Markdown supported. This becomes the agent's system prompt.</div>
              ${this.editingId && this.versions.length > 0 ? html`
                <button class="version-toggle" @click=${() => { this.showVersions = !this.showVersions; }}>
                  ${this.showVersions ? "Hide" : "Show"} version history (${this.versions.length})
                </button>
                ${this.showVersions ? html`
                  <div class="version-list">
                    ${[...this.versions].reverse().map((v) => html`
                      <div class="version-item">
                        <span class="v-label">v${v.version}</span>
                        <span class="v-date">${new Date(v.createdAt).toLocaleString()}</span>
                        ${v.summary ? html`<span class="v-summary">${v.summary}</span>` : nothing}
                        ${v.version === this.currentVersion ? html`<span class="v-current">current</span>` : html`
                          <button class="btn-revert" @click=${() => this.revertVersion(this.editingId!, v.version)}>revert</button>
                        `}
                      </div>
                    `)}
                  </div>
                ` : nothing}
              ` : nothing}
            </div>

            <div class="form-field">
              <label class="form-label">Skills (comma-separated)</label>
              <input class="form-input" .value=${this.formSkills}
                @input=${(e: InputEvent) => this.formSkills = (e.target as HTMLInputElement).value}
                placeholder="e.g. code, review, test" />
            </div>

            <div class="form-field">
              <label class="form-label">Sandbox</label>
              <div class="form-check">
                <input type="checkbox" id="cb-docker" .checked=${this.formDocker}
                  @change=${(e: Event) => this.formDocker = (e.target as HTMLInputElement).checked} />
                <label for="cb-docker">Docker</label>
              </div>
              <div class="form-check">
                <input type="checkbox" id="cb-network" .checked=${this.formNetwork}
                  @change=${(e: Event) => this.formNetwork = (e.target as HTMLInputElement).checked} />
                <label for="cb-network">Network</label>
              </div>
              <div class="form-check">
                <input type="checkbox" id="cb-browser" .checked=${this.formBrowser}
                  @change=${(e: Event) => this.formBrowser = (e.target as HTMLInputElement).checked} />
                <label for="cb-browser">Browser</label>
              </div>
            </div>

            <div class="form-check">
              <input type="checkbox" id="cb-default" .checked=${this.formDefault}
                @change=${(e: Event) => this.formDefault = (e.target as HTMLInputElement).checked} />
              <label for="cb-default">Set as default agent</label>
            </div>

            <div class="form-actions">
              <button class="btn-cancel" @click=${() => this.showForm = false}>Cancel</button>
              <button class="btn-primary" @click=${this.submitForm}>
                ${this.editingId ? "Save Changes" : "Create Agent"}
              </button>
            </div>
          </div>
        </div>
      ` : nothing}
    `;
  }
}
