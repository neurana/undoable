import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { ChatEntry, SessionItem, ApiMessage, SseEvent } from "./chat-types.js";
import { chatStyles, chatAreaStyles, responsiveStyles } from "./chat-styles.js";
import "./chat-sidebar.js";
import "./chat-input.js";
import "./chat-messages.js";
import "./chat-settings.js";

@customElement("undoable-chat")
export class UndoableChat extends LitElement {
  static styles = [chatStyles, chatAreaStyles, responsiveStyles, css`
    .empty {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      color: var(--text-tertiary); gap: 16px;
      padding-bottom: 40px;
    }
    .ant-logo { width: 140px; height: 140px; }
    .empty-title { font-size: 28px; font-weight: 400; color: var(--text-primary); letter-spacing: -0.02em; margin-top: 4px; font-family: var(--font-serif); }
    .empty-sub { font-size: 13px; max-width: 360px; text-align: center; line-height: 1.6; color: var(--text-secondary); }
    .error {
      color: var(--danger); font-size: 12px;
      max-width: var(--content-w); margin: 0 auto;
      padding: 6px var(--gutter) 6px calc(var(--gutter) + var(--col-offset));
    }
    .status-info {
      display: flex; align-items: center; gap: 14px;
      font-size: 11px; color: var(--text-tertiary);
    }
    .status-badge {
      padding: 2px 8px; border-radius: var(--radius-pill);
      font-weight: 600; font-size: 9px;
      text-transform: uppercase; letter-spacing: 0.4px;
      border: 1px solid transparent;
    }
    .badge-interactive { background: var(--wash); color: var(--text-secondary); border-color: var(--border-strong); }
    .badge-autonomous { background: var(--danger-subtle); color: var(--danger); border-color: rgba(192,57,43,0.15); }
    .badge-supervised { background: var(--accent-subtle); color: var(--dark); border-color: var(--mint-strong); }
    .badge-off { background: var(--bg-deep); color: var(--text-tertiary); border-color: var(--border-strong); }
    .badge-mutate { background: var(--warning-subtle); color: var(--warning); border-color: rgba(184,134,11,0.15); }
    .badge-always { background: var(--danger-subtle); color: var(--danger); border-color: rgba(192,57,43,0.15); }
    .usage-label {
      font-family: var(--mono); font-size: 10px; color: var(--text-tertiary);
      background: var(--wash); padding: 2px 8px; border-radius: var(--radius-pill);
      cursor: help;
    }
    .sidebar-backdrop {
      display: none; position: fixed; inset: 0;
      background: rgba(17,26,23,0.25); z-index: 9;
    }
    .agent-selector { position: relative; }
    .agent-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: var(--radius-pill);
      background: var(--wash); color: var(--text-secondary);
      font-size: 11px; font-weight: 500; border: 1px solid var(--border-strong);
      cursor: pointer; transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
      white-space: nowrap;
    }
    .agent-btn:hover { background: var(--wash-strong); border-color: var(--mint-strong); color: var(--dark); }
    .agent-btn svg { width: 10px; height: 10px; stroke: currentColor; stroke-width: 2; fill: none; }
    .agent-dropdown {
      position: absolute; top: 100%; left: 0; margin-top: 4px;
      min-width: 200px; max-height: 240px; overflow-y: auto;
      background: var(--surface-1); border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm); box-shadow: var(--shadow-raised);
      z-index: 20;
    }
    .agent-option {
      display: flex; flex-direction: column; gap: 1px;
      padding: 8px 12px; cursor: pointer;
      transition: background 120ms ease;
    }
    .agent-option:hover { background: var(--wash); }
    .agent-option.active { background: var(--accent-subtle); }
    .agent-option-name { font-size: 12px; font-weight: 500; color: var(--text-primary); }
    .agent-option-model { font-size: 10px; color: var(--text-tertiary); font-family: var(--mono); }
    @media (max-width: 768px) {
      .sidebar-backdrop.visible { display: block; }
      .empty-title { font-size: 18px; }
      .ant-logo { width: 100px; height: 100px; }
    }
  `];

  @state() private sidebarOpen = true;
  @state() private sessions: SessionItem[] = [];
  @state() private activeSessionId = "";
  @state() private entries: ChatEntry[] = [];
  @state() private loading = false;
  @state() private error = "";
  @state() private runMode = "";
  @state() private approvalModeLabel = "";
  @state() private maxIter = 0;
  @state() private currentIter = 0;
  @state() private hasUndoable = false;
  @state() private thinkingLevel = "";
  @state() private canThink = false;
  @state() private currentModel = "";
  @state() private currentProvider = "";
  @state() private reasoningVis = "";
  @state() private settingsOpen = false;
  @state() private agents: Array<{ id: string; name: string; model: string; identity?: { emoji?: string } }> = [];
  @state() private currentAgentId = "";
  @state() private agentDropdownOpen = false;
  @state() private activeRunId = "";
  @state() private usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  @state() private showOnboarding = false;


  // ── Lifecycle ──

  connectedCallback() {
    super.connectedCallback();
    if (window.innerWidth <= 768) this.sidebarOpen = false;
    this.loadSessions().then(() => this.restoreFromUrl());
    this.fetchRunConfig();
    this.fetchAgents();
    this.checkOnboarding();
    window.addEventListener("popstate", this.onPopState);
    window.addEventListener("keydown", this.onGlobalKey);
    this.addEventListener("click", this.closeAgentDropdown);
    this.addEventListener("onboarding-complete", this.onOnboardingDone as EventListener);
    this.addEventListener("onboarding-close", this.onOnboardingDone as EventListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("popstate", this.onPopState);
    window.removeEventListener("keydown", this.onGlobalKey);
    this.removeEventListener("click", this.closeAgentDropdown);
    this.removeEventListener("onboarding-complete", this.onOnboardingDone as EventListener);
    this.removeEventListener("onboarding-close", this.onOnboardingDone as EventListener);
  }

  private async checkOnboarding() {
    try {
      const res = await fetch("/api/chat/onboarding");
      if (res.ok) {
        const p = await res.json();
        if (!p.completed) this.showOnboarding = true;
      }
    } catch { }
  }

  private onOnboardingDone = () => { this.showOnboarding = false; };

  private onGlobalKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "b") {
      e.preventDefault();
      this.toggleSidebar();
    }
    if (e.key === "Escape" && this.sidebarOpen && window.innerWidth <= 768) {
      this.sidebarOpen = false;
    }
  };

  private closeAgentDropdown = (e: Event) => {
    if (!this.agentDropdownOpen) return;
    const path = e.composedPath();
    const sel = this.shadowRoot?.querySelector(".agent-selector");
    if (sel && !path.includes(sel)) this.agentDropdownOpen = false;
  };

  updated(changed: Map<string, unknown>) {
    super.updated(changed);
  }

  // ── URL / routing ──

  private onPopState = () => { this.restoreFromUrl(); };

  private restoreFromUrl() {
    const match = window.location.pathname.match(/^\/chat\/(.+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]!);
      if (id && id !== this.activeSessionId) this.selectSession(id);
    }
  }

  private pushChatUrl(id: string) {
    const target = id ? `/chat/${encodeURIComponent(id)}` : "/";
    if (window.location.pathname !== target) window.history.pushState(null, "", target);
  }

  // ── API helpers ──

  private async fetchRunConfig() {
    try {
      const res = await fetch("/api/chat/run-config");
      if (res.ok) {
        const data = await res.json() as { mode: string; maxIterations: number; approvalMode: string; thinking?: string; reasoningVisibility?: string; model?: string; provider?: string; canThink?: boolean };
        this.runMode = data.mode;
        this.maxIter = data.maxIterations;
        this.approvalModeLabel = data.approvalMode;
        this.thinkingLevel = data.thinking ?? "";
        this.reasoningVis = data.reasoningVisibility ?? "";
        this.currentModel = data.model ?? "";
        this.currentProvider = data.provider ?? "";
        this.canThink = data.canThink ?? false;
      }
    } catch { /* ignore */ }
  }

  private async fetchAgents() {
    try {
      const res = await fetch("/api/chat/agents");
      if (res.ok) {
        const data = await res.json() as { agents: Array<{ id: string; name: string; model: string; identity?: { emoji?: string } }>; defaultId: string | null };
        this.agents = data.agents;
        if (!this.currentAgentId && data.defaultId) this.currentAgentId = data.defaultId;
        else if (!this.currentAgentId && data.agents.length > 0) this.currentAgentId = data.agents[0]!.id;
      }
    } catch { /* ignore */ }
  }

  private selectAgent(id: string) {
    this.currentAgentId = id;
    this.agentDropdownOpen = false;
  }

  private async loadSessions() {
    try {
      const res = await fetch("/api/chat/sessions");
      if (res.ok) this.sessions = await res.json() as SessionItem[];
    } catch { }
  }

  private async newChat() {
    try {
      const res = await fetch("/api/chat/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!res.ok) return;
      const data = await res.json() as { id: string };
      this.activeSessionId = data.id;
      this.entries = [];
      this.hasUndoable = false;
      this.error = "";
      this.pushChatUrl(data.id);
      await this.loadSessions();
    } catch { }
  }

  private async selectSession(id: string) {
    if (id === this.activeSessionId) return;
    this.activeSessionId = id;
    this.entries = [];
    this.hasUndoable = false;
    this.error = "";
    this.pushChatUrl(id);
    try {
      const res = await fetch(`/api/chat/sessions/${id}`);
      if (!res.ok) return;
      const data = await res.json() as { messages: ApiMessage[]; agentId?: string };
      this.entries = this.apiMessagesToEntries(data.messages);
      // Restore agent context from the session
      if (data.agentId && this.agents.some((a) => a.id === data.agentId)) {
        this.currentAgentId = data.agentId;
      }
    } catch { }
  }

  private async deleteSession(id: string) {
    try {
      await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
      if (this.activeSessionId === id) { this.activeSessionId = ""; this.entries = []; this.pushChatUrl(""); }
      await this.loadSessions();
    } catch { }
  }

  private async renameSession(detail: { id: string; title: string }) {
    try {
      await fetch(`/api/chat/sessions/${detail.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: detail.title }),
      });
      await this.loadSessions();
    } catch { }
  }

  private async resetSession(id: string) {
    try {
      await fetch(`/api/chat/sessions/${id}/reset`, { method: "POST" });
      if (this.activeSessionId === id) { this.entries = []; this.hasUndoable = false; }
      await this.loadSessions();
    } catch { }
  }

  private apiMessagesToEntries(messages: ApiMessage[]): ChatEntry[] {
    const entries: ChatEntry[] = [];
    for (const msg of messages) {
      if (msg.role === "user" && msg.content) {
        entries.push({ kind: "user", content: msg.content });
      } else if (msg.role === "assistant" && msg.content) {
        entries.push({ kind: "assistant", content: msg.content });
      } else if (msg.role === "assistant" && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { }
          entries.push({ kind: "tool_call", name: tc.function.name, args });
        }
      } else if (msg.role === "tool" && msg.content) {
        let result: unknown;
        try { result = JSON.parse(msg.content); } catch { result = msg.content; }
        entries.push({ kind: "tool_result", name: "", result });
      }
    }
    return entries;
  }

  // ── Approval & undo ──

  private async handleApproval(detail: { id: string; approved: boolean; allowAlways?: boolean }) {
    try {
      await fetch("/api/chat/approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detail.id, approved: detail.approved, allowAlways: detail.allowAlways }),
      });
      this.entries = this.entries.map((e) =>
        e.kind === "approval" && e.id === detail.id ? { ...e, resolved: true, approved: detail.approved } : e,
      );
    } catch (err) { this.error = `Approval failed: ${err}`; }
  }

  private async handleAbort() {
    try {
      const body: Record<string, string> = {};
      if (this.activeRunId) body.runId = this.activeRunId;
      else if (this.activeSessionId) body.sessionId = this.activeSessionId;
      await fetch("/api/chat/abort", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch { /* ignore */ }
  }

  private async handleUndo(action: string) {
    try {
      const res = await fetch("/api/chat/undo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json() as Record<string, unknown>;
      this.entries = [...this.entries, { kind: "assistant", content: `Undo (${action}): ${JSON.stringify(data)}` }];
    } catch (err) { this.error = `Undo failed: ${err}`; }
  }

  // ── Send + SSE streaming ──

  private async handleSendMessage(detail: { text: string; attachments?: Array<{ fileName: string; mimeType: string; content: string }> }) {
    const { text, attachments } = detail;
    if (!text && !attachments?.length) return;
    if (this.loading) return;

    if (!this.activeSessionId) await this.newChat();

    const hasFiles = !!attachments?.length;
    const displayText = hasFiles && text ? text : hasFiles ? `[${attachments!.length} file${attachments!.length > 1 ? "s" : ""}]` : text;
    const images = attachments?.filter((a) => a.mimeType.startsWith("image/")).map((a) => `data:${a.mimeType};base64,${a.content}`) ?? [];

    this.error = "";
    this.currentIter = 0;
    this.usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    this.entries = [...this.entries, { kind: "user", content: displayText, ...(images.length > 0 ? { images } : {}) }];
    this.loading = true;

    const aiEntry: ChatEntry & { kind: "assistant" } = { kind: "assistant", content: "", streaming: true };
    let aiAdded = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: this.activeSessionId, agentId: this.currentAgentId || undefined, attachments }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") continue;
          try {
            const evt = JSON.parse(raw) as SseEvent;
            if (evt.type === "run_start") {
              this.activeRunId = evt.runId ?? "";
            } else if (evt.type === "aborted") {
              this.entries = [...this.entries, { kind: "warning", content: "Generation stopped." }];
              this.activeRunId = "";
            } else if (evt.type === "session_info") {
              this.runMode = evt.mode ?? "";
              this.approvalModeLabel = evt.approvalMode ?? "";
              this.maxIter = evt.maxIterations ?? 0;
              this.thinkingLevel = evt.thinking ?? "";
              this.reasoningVis = evt.reasoningVisibility ?? "";
              this.currentModel = evt.model ?? this.currentModel;
              this.currentProvider = evt.provider ?? this.currentProvider;
              this.canThink = evt.canThink ?? false;
            } else if (evt.type === "progress") {
              this.currentIter = evt.iteration ?? 0;
              this.maxIter = evt.maxIterations ?? this.maxIter;
            } else if (evt.type === "thinking") {
              const last = this.entries[this.entries.length - 1];
              if (last?.kind === "thinking" && last.streaming) {
                this.entries = [...this.entries.slice(0, -1), { kind: "thinking", content: last.content + (evt.content ?? ""), streaming: !!evt.streaming }];
              } else {
                this.entries = [...this.entries, { kind: "thinking", content: evt.content ?? "", streaming: !!evt.streaming }];
              }
            } else if (evt.type === "token") {
              if (!aiAdded) { this.entries = [...this.entries, aiEntry]; aiAdded = true; }
              aiEntry.content += evt.content ?? "";
              this.entries = [...this.entries.slice(0, -1), { ...aiEntry }];
            } else if (evt.type === "tool_call") {
              if (aiAdded && aiEntry.content) {
                aiEntry.streaming = false;
                this.entries = [...this.entries.slice(0, -1), { ...aiEntry }];
                aiAdded = false;
                aiEntry.content = "";
              }
              this.entries = [...this.entries, {
                kind: "tool_call", name: evt.name ?? "?", args: evt.args ?? {},
                iteration: evt.iteration, maxIterations: evt.maxIterations,
              }];
            } else if (evt.type === "tool_result") {
              this.entries = [...this.entries, { kind: "tool_result", name: evt.name ?? "?", result: evt.result }];
              this.hasUndoable = true;
            } else if (evt.type === "approval_pending") {
              this.entries = [...this.entries, {
                kind: "approval", id: evt.id ?? "", tool: evt.tool ?? "?",
                description: evt.description, args: evt.args,
              }];
            } else if (evt.type === "warning") {
              this.entries = [...this.entries, { kind: "warning", content: evt.content ?? "" }];
            } else if (evt.type === "usage" && evt.usage) {
              this.usage = { ...evt.usage };
            } else if (evt.type === "done") {
              if (evt.usage) this.usage = { ...evt.usage };
              if (!aiAdded && evt.content) {
                this.entries = [...this.entries, { kind: "assistant", content: evt.content }];
              } else if (aiAdded) {
                aiEntry.streaming = false;
                aiEntry.content = evt.content ?? aiEntry.content;
                this.entries = [...this.entries.slice(0, -1), { ...aiEntry }];
              }
              aiAdded = false;
            } else if (evt.type === "error") {
              this.error = evt.content ?? "Unknown error";
            }
          } catch { }
        }
      }

      if (aiAdded) {
        aiEntry.streaming = false;
        this.entries = [...this.entries.slice(0, -1), { ...aiEntry }];
      }
    } catch (err) {
      this.error = String(err);
      if (aiAdded && !aiEntry.content) this.entries = this.entries.slice(0, -1);
    } finally {
      this.loading = false;
      this.currentIter = 0;
      this.activeRunId = "";
      this.loadSessions();
    }
  }

  // ── Config cycling ──

  private async cycleRunMode() {
    const cycle: Record<string, string> = { interactive: "supervised", supervised: "autonomous", autonomous: "interactive" };
    const next = cycle[this.runMode || "interactive"] ?? "interactive";
    try {
      const res = await fetch("/api/chat/run-config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      if (res.ok) {
        const data = await res.json() as { mode: string; maxIterations: number; approvalMode: string };
        this.runMode = data.mode;
        this.maxIter = data.maxIterations;
        this.approvalModeLabel = data.approvalMode;
      }
    } catch { }
  }

  private async cycleApprovalMode() {
    const cycle: Record<string, string> = { off: "mutate", mutate: "always", always: "off" };
    const next = cycle[this.approvalModeLabel || "off"] ?? "off";
    try {
      const res = await fetch("/api/chat/approval-mode", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      if (res.ok) this.approvalModeLabel = next;
    } catch { }
  }

  private async cycleThinkingLevel() {
    const cycle: Record<string, string> = { off: "low", low: "medium", medium: "high", high: "off" };
    const next = cycle[this.thinkingLevel || "off"] ?? "off";
    const vis = this.reasoningVis === "off" && next !== "off" ? "stream" : this.reasoningVis;
    try {
      const res = await fetch("/api/chat/thinking", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: next, visibility: vis }),
      });
      if (res.ok) {
        const data = await res.json() as { level: string; visibility: string; canThink: boolean };
        this.thinkingLevel = data.level;
        this.reasoningVis = data.visibility;
        this.canThink = data.canThink;
      }
    } catch { }
  }

  private async editMaxIter() {
    const val = prompt("Max iterations:", String(this.maxIter));
    if (val === null) return;
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 1) return;
    try {
      const res = await fetch("/api/chat/run-config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxIterations: n }),
      });
      if (res.ok) {
        const data = await res.json() as { maxIterations: number };
        this.maxIter = data.maxIterations;
      }
    } catch { }
  }

  private fmtTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  private badgeClass(mode: string) {
    const m: Record<string, string> = { autonomous: "badge-autonomous", supervised: "badge-supervised", mutate: "badge-mutate", always: "badge-always", off: "badge-off" };
    return m[mode] ?? "badge-interactive";
  }


  // ── Navigation ──

  private toggleSidebar() { this.sidebarOpen = !this.sidebarOpen; }

  private emitNavigate(view: string) {
    this.dispatchEvent(new CustomEvent("navigate", { detail: view, bubbles: true, composed: true }));
  }

  // ── Render ──

  render() {
    return html`
      <div class="sidebar-backdrop ${this.sidebarOpen ? "visible" : ""}" @click=${this.toggleSidebar}></div>

      <chat-sidebar
        ?collapsed=${!this.sidebarOpen}
        .sessions=${this.sessions}
        .activeSessionId=${this.activeSessionId}
        @new-chat=${() => this.newChat()}
        @select-session=${(e: CustomEvent) => this.selectSession(e.detail)}
        @delete-session=${(e: CustomEvent) => this.deleteSession(e.detail)}
        @rename-session=${(e: CustomEvent) => this.renameSession(e.detail)}
        @reset-session=${(e: CustomEvent) => this.resetSession(e.detail)}
        @navigate=${(e: CustomEvent) => this.emitNavigate(e.detail)}
        @open-settings=${() => { this.settingsOpen = true; }}
      ></chat-sidebar>

      <div class="chat-area">
        <div class="chat-header">
          <button class="btn-toggle-sidebar" @click=${this.toggleSidebar} title=${this.sidebarOpen ? "Hide sidebar" : "Show sidebar"}>
            <svg class="toggle-icon" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>
          ${this.agents.length > 0 ? html`
            <div class="agent-selector">
              <button class="agent-btn" @click=${() => { this.agentDropdownOpen = !this.agentDropdownOpen; }} title="Switch agent">
                ${(() => { const a = this.agents.find((a) => a.id === this.currentAgentId); return a ? `${a.identity?.emoji ? a.identity.emoji + " " : ""}${a.name}` : "Agent"; })()}
                <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
              </button>
              ${this.agentDropdownOpen ? html`
                <div class="agent-dropdown">
                  ${this.agents.map((a) => html`
                    <div class="agent-option ${a.id === this.currentAgentId ? "active" : ""}" @click=${() => this.selectAgent(a.id)}>
                      <span class="agent-option-name">${a.identity?.emoji ? a.identity.emoji + " " : ""}${a.name}</span>
                      <span class="agent-option-model">${a.model}</span>
                    </div>
                  `)}
                </div>
              ` : nothing}
            </div>
          ` : nothing}
          ${this.currentModel ? html`<span class="model-label" style="cursor:pointer;" title=${`${this.currentProvider}/${this.currentModel}. Click to change.`} @click=${() => { this.settingsOpen = true; }}>${this.currentModel}</span>` : nothing}
          <div class="chat-header-spacer"></div>
          <button class="btn-header-icon" @click=${() => { this.showOnboarding = true; }} title="Profile & Onboarding">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>
          ${this.runMode && this.entries.length > 0 ? html`
            <div class="status-info">
              <span>Mode: <span class="status-badge ${this.badgeClass(this.runMode)}" style="cursor:pointer;" title="Click to cycle" @click=${this.cycleRunMode}>${this.runMode}</span></span>
              <span>Approval: <span class="status-badge ${this.badgeClass(this.approvalModeLabel)}" style="cursor:pointer;" title="Click to cycle" @click=${this.cycleApprovalMode}>${this.approvalModeLabel || "off"}</span></span>
              ${this.maxIter ? html`<span style="cursor:pointer;" title="Click to change" @click=${this.editMaxIter}>Max: <b>${this.maxIter}</b></span>` : nothing}
              ${this.usage.totalTokens > 0 ? html`<span class="usage-label" title="Prompt: ${this.usage.promptTokens} | Completion: ${this.usage.completionTokens}">${this.fmtTokens(this.usage.totalTokens)} tokens</span>` : nothing}
            </div>
          ` : nothing}
        </div>

        ${this.entries.length === 0 ? html`
          <div class="empty">
            <img class="ant-logo" src="/logo.svg" alt="Undoable" />
            <div class="empty-title">Undoable</div>
            <div class="empty-sub">Everything the AI does is recorded and can be undone. Start a conversation or pick one from the sidebar.</div>
          </div>
        ` : html`
          <chat-messages
            .entries=${this.entries}
            ?loading=${this.loading}
            .currentIter=${this.currentIter}
            .maxIter=${this.maxIter}
            @handle-approval=${(e: CustomEvent) => this.handleApproval(e.detail)}
            @chat-error=${(e: CustomEvent) => { this.error = e.detail; }}
          ></chat-messages>
        `}

        ${this.error ? html`<div class="error">${this.error}</div>` : nothing}

        <chat-input
          ?loading=${this.loading}
          ?hasUndoable=${this.hasUndoable}
          .thinkingLevel=${this.canThink ? this.thinkingLevel : ""}
          ?canThink=${this.canThink}
          @send-message=${(e: CustomEvent) => this.handleSendMessage(e.detail)}
          @abort-chat=${() => this.handleAbort()}
          @undo=${(e: CustomEvent) => this.handleUndo(e.detail)}
          @cycle-thinking=${this.cycleThinkingLevel}
          @chat-error=${(e: CustomEvent) => { this.error = e.detail; }}
        ></chat-input>
      </div>

      <chat-settings
        ?open=${this.settingsOpen}
        .currentModel=${this.currentModel}
        .currentProvider=${this.currentProvider}
        @model-changed=${(e: CustomEvent) => this.handleModelChanged(e.detail)}
        @close-settings=${() => { this.settingsOpen = false; }}
      ></chat-settings>

      ${this.showOnboarding ? html`<undoable-onboarding></undoable-onboarding>` : nothing}
    `;
  }

  private handleModelChanged(detail: { model: string; provider: string; name: string; capabilities: { thinking: boolean } }) {
    this.currentModel = detail.model;
    this.currentProvider = detail.provider;
    this.canThink = detail.capabilities.thinking;
    if (!this.canThink && this.thinkingLevel !== "off") {
      this.thinkingLevel = "off";
    }
    this.settingsOpen = false;
  }
}
