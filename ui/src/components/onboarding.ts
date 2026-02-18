import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

type OnboardingProfile = {
  userName: string;
  botName: string;
  timezone: string;
  personality: string;
  instructions: string;
  completed: boolean;
};

@customElement("undoable-onboarding")
export class UndoableOnboarding extends LitElement {
  static styles = css`
    :host {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      animation: fadeIn 300ms ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(24px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .card {
      background: var(--bg-base, #111);
      border: 1px solid var(--border-divider, #2a2a2a);
      border-radius: 20px;
      width: 100%; max-width: 520px;
      padding: 40px 36px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
      animation: slideUp 400ms cubic-bezier(0.2, 0.8, 0.2, 1);
      position: relative;
    }

    .close-btn {
      position: absolute; top: 16px; right: 16px;
      width: 32px; height: 32px; border-radius: 8px;
      background: transparent; border: none;
      color: var(--text-tertiary, #666); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 150ms ease;
    }
    .close-btn:hover { background: var(--wash, #1a1a1a); color: var(--text-primary, #eee); }
    .close-btn svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 2; fill: none; }

    .step-dots {
      display: flex; gap: 6px; justify-content: center; margin-bottom: 32px;
    }
    .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--border-strong, #333);
      transition: all 300ms ease;
    }
    .dot[data-active] { background: var(--text-primary, #eee); width: 24px; border-radius: 4px; }
    .dot[data-done] { background: var(--text-secondary, #999); }

    .step-title {
      font-family: var(--font-serif, Georgia, serif);
      font-size: 24px; font-weight: 400;
      color: var(--text-primary, #eee);
      margin: 0 0 8px; letter-spacing: -0.02em;
      text-align: center;
    }

    .step-desc {
      font-size: 14px; color: var(--text-secondary, #999);
      margin: 0 0 28px; text-align: center; line-height: 1.5;
    }

    .field { margin-bottom: 20px; }
    .field-hint {
      margin-top: 6px;
      font-size: 11px;
      color: var(--text-tertiary, #666);
      line-height: 1.4;
    }

    .field label {
      display: block; font-size: 12px; font-weight: 500;
      color: var(--text-secondary, #999);
      text-transform: uppercase; letter-spacing: 0.05em;
      margin-bottom: 6px;
    }

    .field input, .field textarea {
      width: 100%; box-sizing: border-box;
      background: var(--surface-1, #1a1a1a);
      border: 1px solid var(--border-strong, #333);
      border-radius: 10px;
      color: var(--text-primary, #eee);
      font-size: 15px; padding: 10px 14px;
      font-family: inherit;
      transition: border-color 200ms ease;
      outline: none;
    }
    .field input:focus, .field textarea:focus {
      border-color: var(--text-secondary, #999);
    }
    .field input::placeholder, .field textarea::placeholder {
      color: var(--text-tertiary, #555);
    }
    .field textarea { min-height: 120px; resize: vertical; line-height: 1.5; }

    .field select {
      width: 100%; box-sizing: border-box;
      background: var(--surface-1, #1a1a1a);
      border: 1px solid var(--border-strong, #333);
      border-radius: 10px;
      color: var(--text-primary, #eee);
      font-size: 15px; padding: 10px 14px;
      font-family: inherit;
      transition: border-color 200ms ease;
      outline: none; appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 12px center;
    }
    .field select:focus { border-color: var(--text-secondary, #999); }

    .tz-search {
      width: 100%; box-sizing: border-box;
      background: var(--surface-1, #1a1a1a);
      border: 1px solid var(--border-strong, #333);
      border-radius: 10px 10px 0 0;
      color: var(--text-primary, #eee);
      font-size: 14px; padding: 8px 14px;
      font-family: inherit; outline: none;
      border-bottom: none;
    }
    .tz-search::placeholder { color: var(--text-tertiary, #555); }
    .tz-search:focus { border-color: var(--text-secondary, #999); }
    .tz-list {
      width: 100%; box-sizing: border-box;
      background: var(--surface-1, #1a1a1a);
      border: 1px solid var(--border-strong, #333);
      border-radius: 0 0 10px 10px;
      max-height: 180px; overflow-y: auto;
    }
    .tz-list:focus-within { border-color: var(--text-secondary, #999); }
    .tz-option {
      padding: 7px 14px; font-size: 13px; cursor: pointer;
      color: var(--text-secondary, #999);
      transition: all 100ms ease;
    }
    .tz-option:hover { background: var(--wash, #1a1a1a); color: var(--text-primary, #eee); }
    .tz-option[data-selected] { color: var(--text-primary, #eee); font-weight: 500; background: var(--wash-strong, #222); }

    .actions {
      display: flex; gap: 10px; justify-content: flex-end; margin-top: 28px;
    }

    .btn {
      padding: 10px 24px; border-radius: 10px;
      font-size: 14px; font-weight: 500; cursor: pointer;
      border: 1px solid var(--border-strong, #333);
      transition: all 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    .btn-secondary {
      background: transparent; color: var(--text-secondary, #999);
    }
    .btn-secondary:hover { background: var(--wash, #1a1a1a); color: var(--text-primary, #eee); }

    .btn-primary {
      background: var(--text-primary, #eee); color: var(--bg-base, #111);
      border-color: var(--text-primary, #eee);
    }
    .btn-primary:hover { opacity: 0.9; }
    .btn-primary:disabled { opacity: 0.4; cursor: default; }

    .welcome-logo {
      display: flex; justify-content: center; margin-bottom: 16px;
    }
    .welcome-logo img { width: 56px; height: 56px; border-radius: 14px; }

    .preview-box {
      background: var(--surface-1, #1a1a1a);
      border: 1px solid var(--border-strong, #333);
      border-radius: 10px; padding: 16px;
      font-size: 13px; color: var(--text-secondary, #999);
      line-height: 1.6; margin-bottom: 8px;
    }
    .preview-box strong { color: var(--text-primary, #eee); }

    .save-error {
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(192, 57, 43, 0.35);
      background: rgba(192, 57, 43, 0.1);
      color: #f1b7ae;
      font-size: 12px;
      line-height: 1.4;
    }

    @media (max-width: 560px) {
      .card { margin: 16px; padding: 28px 20px; border-radius: 16px; }
      .step-title { font-size: 20px; }
    }
  `;

  @state() private step = 0;
  @state() private userName = "";
  @state() private botName = "Undoable";
  @state() private timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  @state() private personality = "";
  @state() private instructions = "";
  @state() private saving = false;
  @state() private loaded = false;
  @state() private tzFilter = "";
  @state() private saveError = "";

  private allTimezones: string[] = (() => {
    try { return Intl.supportedValuesOf("timeZone"); } catch { return []; }
  })();

  private totalSteps = 3;

  private filteredTimezones(): string[] {
    const q = this.tzFilter.toLowerCase();
    if (!q) {
      const idx = this.allTimezones.indexOf(this.timezone);
      if (idx > 0) {
        return [this.timezone, ...this.allTimezones.slice(0, idx), ...this.allTimezones.slice(idx + 1)];
      }
      return this.allTimezones;
    }
    return this.allTimezones.filter((tz) => tz.toLowerCase().includes(q));
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadProfile();
  }

  private async loadProfile() {
    try {
      const res = await fetch("/api/chat/onboarding");
      if (res.ok) {
        const p: OnboardingProfile = await res.json();
        this.userName = p.userName || "";
        this.botName = p.botName || "Undoable";
        this.timezone = p.timezone || this.timezone;
        this.personality = p.personality || "";
        this.instructions = p.instructions || "";
      }
    } catch { }
    this.loaded = true;
  }

  private async saveProfile() {
    this.saving = true;
    this.saveError = "";
    try {
      const response = await fetch("/api/chat/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: this.userName,
          botName: this.botName,
          timezone: this.timezone,
          personality: this.personality || undefined,
          instructions: this.instructions || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to save onboarding profile (${response.status})`);
      }
      this.dispatchEvent(new CustomEvent("onboarding-complete", { bubbles: true, composed: true }));
    } catch (e) {
      this.saveError = `Could not save profile. ${(e as Error).message}`;
    }
    this.saving = false;
  }

  private next() {
    if (this.step < this.totalSteps - 1) this.step++;
    else this.saveProfile();
  }

  private back() {
    if (this.step > 0) this.step--;
  }

  private async close() {
    if (this.saving) return;
    this.saving = true;
    try {
      await fetch("/api/chat/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: this.userName || "User",
          botName: this.botName || "Undoable",
          timezone: this.timezone,
          personality: this.personality || undefined,
          instructions: this.instructions || undefined,
        }),
      });
    } catch {
      // Skip should not block entry to the app; defaults can be edited later.
    } finally {
      this.saving = false;
      this.dispatchEvent(
        new CustomEvent("onboarding-close", {
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private renderDots() {
    return html`
      <div class="step-dots">
        ${Array.from({ length: this.totalSteps }, (_, i) =>
          html`<div class="dot" ?data-active=${i === this.step} ?data-done=${i < this.step}></div>`
        )}
      </div>
    `;
  }

  private renderStep0() {
    return html`
      <div class="welcome-logo"><img src="/logo.svg" alt="Undoable" /></div>
      ${this.renderDots()}
      <h2 class="step-title">Welcome to Undoable</h2>
      <p class="step-desc">Let's set up your profile so the AI knows who you are and how to address you.</p>

      <div class="field">
        <label>Your Name</label>
        <input type="text" placeholder="How should the AI address you?" .value=${this.userName}
          @input=${(e: Event) => this.userName = (e.target as HTMLInputElement).value} />
      </div>

      <div class="field">
        <label>Timezone — <strong style="color:var(--text-primary,#eee)">${this.timezone}</strong></label>
        <input class="tz-search" type="text" placeholder="Search timezones…" .value=${this.tzFilter}
          @input=${(e: Event) => this.tzFilter = (e.target as HTMLInputElement).value} />
        <div class="tz-list">
          ${this.filteredTimezones().map((tz) => html`
            <div class="tz-option" ?data-selected=${tz === this.timezone}
              @click=${() => { this.timezone = tz; this.tzFilter = ""; }}>${tz}</div>
          `)}
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-primary" @click=${this.next}>Continue</button>
      </div>
    `;
  }

  private renderStep1() {
    return html`
      ${this.renderDots()}
      <h2 class="step-title">Bot Identity</h2>
      <p class="step-desc">Give your AI assistant a name and personality.</p>

      <div class="field">
        <label>Bot Name</label>
        <input type="text" placeholder="e.g. Atlas, Nova, Undoable" .value=${this.botName}
          @input=${(e: Event) => this.botName = (e.target as HTMLInputElement).value} />
        <div class="field-hint">Used as the assistant identity shown in prompts and metadata.</div>
      </div>

      <div class="field">
        <label>Personality (SOUL.md)</label>
        <textarea placeholder="Describe the AI's personality, tone, and behavior. Leave blank for the default helpful assistant."
          .value=${this.personality}
          @input=${(e: Event) => this.personality = (e.target as HTMLTextAreaElement).value}></textarea>
        <div class="field-hint">Saved to SOUL.md to guide response tone.</div>
      </div>

      <div class="field">
        <label>Permanent Instructions (IDENTITY.md)</label>
        <textarea placeholder="e.g. Always ask before destructive changes. Prefer concise answers."
          .value=${this.instructions}
          @input=${(e: Event) => this.instructions = (e.target as HTMLTextAreaElement).value}></textarea>
        <div class="field-hint">Saved as long-term assistant instructions in IDENTITY.md.</div>
      </div>

      <div class="actions">
        <button class="btn btn-secondary" @click=${this.back}>Back</button>
        <button class="btn btn-primary" @click=${this.next} ?disabled=${!this.botName.trim()}>Continue</button>
      </div>
    `;
  }

  private renderStep2() {
    const soul = this.personality.trim() || "Default helpful, concise assistant";
    const instructions = this.instructions.trim() || "Personal AI assistant";
    return html`
      ${this.renderDots()}
      <h2 class="step-title">Confirm Setup</h2>
      <p class="step-desc">Review your configuration. You can change these anytime from settings.</p>

      <div class="preview-box">
        <strong>You:</strong> ${this.userName || "—"}<br/>
        <strong>Bot:</strong> ${this.botName || "Undoable"}<br/>
        <strong>Timezone:</strong> ${this.timezone}<br/>
        <strong>Personality:</strong> ${soul.length > 100 ? soul.slice(0, 100) + "…" : soul}<br/>
        <strong>Instructions:</strong> ${instructions.length > 100 ? instructions.slice(0, 100) + "…" : instructions}
      </div>

      <div class="actions">
        <button class="btn btn-secondary" @click=${this.back}>Back</button>
        <button class="btn btn-primary" @click=${this.next} ?disabled=${this.saving}>
          ${this.saving ? "Saving…" : "Save & Start"}
        </button>
      </div>
      ${this.saveError ? html`<div class="save-error">${this.saveError}</div>` : ""}
    `;
  }

  render() {
    if (!this.loaded) return html``;
    return html`
      <div class="card">
        <button class="close-btn" @click=${this.close} title="Skip" ?disabled=${this.saving}>
          <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        ${this.step === 0 ? this.renderStep0() : ""}
        ${this.step === 1 ? this.renderStep1() : ""}
        ${this.step === 2 ? this.renderStep2() : ""}
      </div>
    `;
  }
}
