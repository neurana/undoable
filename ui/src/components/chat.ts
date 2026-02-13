import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import gsap from "gsap";
import type { ChatEntry, SessionItem, ApiMessage, SseEvent } from "./chat-types.js";
import { chatStyles, chatAreaStyles, responsiveStyles } from "./chat-styles.js";
import "./chat-sidebar.js";
import "./chat-input.js";
import "./chat-messages.js";

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
    .undo-bar {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 6px var(--space-2);
      border-top: 1px solid var(--border-divider);
    }
    .btn-undo {
      padding: 5px 14px; border-radius: var(--radius-pill);
      background: var(--surface-1); color: var(--text-secondary);
      font-size: 11px; font-weight: 500;
      border: 1px solid var(--border-strong); cursor: pointer;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .btn-undo:hover { background: var(--wash); border-color: var(--mint-strong); color: var(--dark); }
    .sidebar-backdrop {
      display: none; position: fixed; inset: 0;
      background: rgba(17,26,23,0.25); z-index: 9;
    }
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

  private antAnimated = false;
  private antTimeline: gsap.core.Timeline | null = null;

  // ── Lifecycle ──

  connectedCallback() {
    super.connectedCallback();
    if (window.innerWidth <= 768) this.sidebarOpen = false;
    this.loadSessions().then(() => this.restoreFromUrl());
    this.fetchRunConfig();
    window.addEventListener("popstate", this.onPopState);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.antTimeline) { this.antTimeline.kill(); this.antTimeline = null; }
    window.removeEventListener("popstate", this.onPopState);
  }

  updated(changed: Map<string, unknown>) {
    super.updated(changed);
    if (this.entries.length === 0 && !this.antAnimated) this.animateAnt();
    if (this.entries.length > 0 && this.antAnimated) {
      if (this.antTimeline) { this.antTimeline.kill(); this.antTimeline = null; }
      this.antAnimated = false;
    }
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
        const data = await res.json() as { mode: string; maxIterations: number; approvalMode: string };
        this.runMode = data.mode;
        this.maxIter = data.maxIterations;
        this.approvalModeLabel = data.approvalMode;
      }
    } catch { /* ignore */ }
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
      const data = await res.json() as { messages: ApiMessage[] };
      this.entries = this.apiMessagesToEntries(data.messages);
    } catch { }
  }

  private async deleteSession(id: string) {
    try {
      await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
      if (this.activeSessionId === id) { this.activeSessionId = ""; this.entries = []; this.pushChatUrl(""); }
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

  private async handleApproval(detail: { id: string; approved: boolean }) {
    try {
      await fetch("/api/chat/approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detail.id, approved: detail.approved }),
      });
      this.entries = this.entries.map((e) =>
        e.kind === "approval" && e.id === detail.id ? { ...e, resolved: true, approved: detail.approved } : e,
      );
    } catch (err) { this.error = `Approval failed: ${err}`; }
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
    const displayText = hasFiles ? `${text || ""}${text ? " " : ""}[${attachments!.length} file${attachments!.length > 1 ? "s" : ""}]` : text;

    this.error = "";
    this.currentIter = 0;
    this.entries = [...this.entries, { kind: "user", content: displayText }];
    this.loading = true;

    const aiEntry: ChatEntry & { kind: "assistant" } = { kind: "assistant", content: "", streaming: true };
    let aiAdded = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: this.activeSessionId, attachments }),
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
            if (evt.type === "session_info") {
              this.runMode = evt.mode ?? "";
              this.approvalModeLabel = evt.approvalMode ?? "";
              this.maxIter = evt.maxIterations ?? 0;
            } else if (evt.type === "progress") {
              this.currentIter = evt.iteration ?? 0;
              this.maxIter = evt.maxIterations ?? this.maxIter;
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
            } else if (evt.type === "done") {
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

  private badgeClass(mode: string) {
    const m: Record<string, string> = { autonomous: "badge-autonomous", supervised: "badge-supervised", mutate: "badge-mutate", always: "badge-always", off: "badge-off" };
    return m[mode] ?? "badge-interactive";
  }

  // ── Ant animation ──

  private animateAnt() {
    const root = this.shadowRoot;
    if (!root) return;
    const svg = root.querySelector(".ant-logo");
    if (!svg) return;
    this.antAnimated = true;
    const tl = gsap.timeline({ repeat: -1 });
    this.antTimeline = tl;
    const groupA = [".leg-f1", ".leg-m2", ".leg-b1"].map((s) => svg.querySelector(s)).filter(Boolean);
    const groupB = [".leg-f2", ".leg-m1", ".leg-b2"].map((s) => svg.querySelector(s)).filter(Boolean);
    const antennaL = svg.querySelector(".antenna-l");
    const antennaR = svg.querySelector(".antenna-r");
    tl.to(groupA, { rotation: 8, transformOrigin: "50% 0%", duration: 0.3, ease: "sine.inOut" }, 0);
    tl.to(groupB, { rotation: -8, transformOrigin: "50% 0%", duration: 0.3, ease: "sine.inOut" }, 0);
    tl.to(groupA, { rotation: -8, transformOrigin: "50% 0%", duration: 0.3, ease: "sine.inOut" }, 0.3);
    tl.to(groupB, { rotation: 8, transformOrigin: "50% 0%", duration: 0.3, ease: "sine.inOut" }, 0.3);
    tl.to(groupA, { rotation: 0, transformOrigin: "50% 0%", duration: 0.3, ease: "sine.inOut" }, 0.6);
    tl.to(groupB, { rotation: 0, transformOrigin: "50% 0%", duration: 0.3, ease: "sine.inOut" }, 0.6);
    if (antennaL) gsap.to(antennaL, { rotation: 5, transformOrigin: "100% 100%", duration: 0.8, ease: "sine.inOut", yoyo: true, repeat: -1 });
    if (antennaR) gsap.to(antennaR, { rotation: -5, transformOrigin: "0% 100%", duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 0.2 });
    gsap.to(svg, { y: -3, duration: 0.45, ease: "sine.inOut", yoyo: true, repeat: -1 });
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
        @navigate=${(e: CustomEvent) => this.emitNavigate(e.detail)}
      ></chat-sidebar>

      <div class="chat-area">
        <div class="chat-header">
          <button class="btn-toggle-sidebar" @click=${this.toggleSidebar} title=${this.sidebarOpen ? "Hide sidebar" : "Show sidebar"}>
            <svg class="toggle-icon" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>
          <div class="chat-header-spacer"></div>
          ${this.runMode && this.entries.length > 0 ? html`
            <div class="status-info">
              <span>Mode: <span class="status-badge ${this.badgeClass(this.runMode)}" style="cursor:pointer;" title="Click to cycle" @click=${this.cycleRunMode}>${this.runMode}</span></span>
              <span>Approval: <span class="status-badge ${this.badgeClass(this.approvalModeLabel)}" style="cursor:pointer;" title="Click to cycle" @click=${this.cycleApprovalMode}>${this.approvalModeLabel || "off"}</span></span>
              ${this.maxIter ? html`<span style="cursor:pointer;" title="Click to change" @click=${this.editMaxIter}>Max: <b>${this.maxIter}</b></span>` : nothing}
            </div>
          ` : nothing}
        </div>

        ${this.entries.length === 0 ? html`
          <div class="empty">
            <svg class="ant-logo" viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="100" cy="170" rx="55" ry="6" fill="rgba(0,0,0,0.15)"/>
              <ellipse cx="60" cy="110" rx="30" ry="24" fill="#00D090" stroke="#0B0C10" stroke-width="4"/>
              <ellipse cx="60" cy="108" rx="22" ry="14" fill="#33E0AD" opacity="0.4"/>
              <ellipse cx="100" cy="100" rx="22" ry="20" fill="#00D090" stroke="#0B0C10" stroke-width="4"/>
              <ellipse cx="100" cy="98" rx="15" ry="11" fill="#33E0AD" opacity="0.4"/>
              <ellipse cx="138" cy="88" rx="26" ry="24" fill="#00D090" stroke="#0B0C10" stroke-width="4"/>
              <ellipse cx="138" cy="86" rx="18" ry="14" fill="#33E0AD" opacity="0.4"/>
              <circle cx="145" cy="82" r="4" fill="#0B0C10"/>
              <circle cx="146" cy="81" r="1.5" fill="#33E0AD"/>
              <circle cx="133" cy="84" r="3" fill="#0B0C10"/>
              <circle cx="134" cy="83" r="1" fill="#33E0AD"/>
              <path d="M140 96 Q144 100 148 96" stroke="#0B0C10" stroke-width="2" fill="none" stroke-linecap="round"/>
              <g class="antenna-l"><path d="M130 72 Q120 40 110 30" stroke="#0B0C10" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="110" cy="30" r="4" fill="#00D090" stroke="#0B0C10" stroke-width="2"/></g>
              <g class="antenna-r"><path d="M142 70 Q148 38 156 28" stroke="#0B0C10" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="156" cy="28" r="4" fill="#00D090" stroke="#0B0C10" stroke-width="2"/></g>
              <g class="leg-f1"><path d="M148 100 Q158 120 165 140 Q168 148 162 150" stroke="#0B0C10" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>
              <g class="leg-f2"><path d="M142 104 Q150 125 155 142 Q157 150 151 152" stroke="#0B0C10" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>
              <g class="leg-m1"><path d="M108 108 Q118 130 122 148 Q124 156 118 158" stroke="#0B0C10" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>
              <g class="leg-m2"><path d="M96 112 Q104 134 106 150 Q107 158 101 160" stroke="#0B0C10" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>
              <g class="leg-b1"><path d="M70 118 Q76 138 78 152 Q79 160 73 162" stroke="#0B0C10" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>
              <g class="leg-b2"><path d="M54 120 Q58 140 58 154 Q58 162 52 163" stroke="#0B0C10" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>
            </svg>
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

        ${this.hasUndoable && !this.loading ? html`
          <div class="undo-bar">
            <button class="btn-undo" @click=${() => this.handleUndo("last")}>\u27f2 Undo Last</button>
            <button class="btn-undo" @click=${() => this.handleUndo("all")}>\u27f2 Undo All</button>
          </div>
        ` : nothing}

        <chat-input
          ?loading=${this.loading}
          @send-message=${(e: CustomEvent) => this.handleSendMessage(e.detail)}
          @chat-error=${(e: CustomEvent) => { this.error = e.detail; }}
        ></chat-input>
      </div>
    `;
  }
}
