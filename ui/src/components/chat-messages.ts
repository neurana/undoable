import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { messageStyles, markdownStyles } from "./chat-styles.js";
import { renderMarkdown } from "../utils/markdown.js";
import { api } from "../api/client.js";
import type { ChatEntry } from "./chat-types.js";

@customElement("chat-messages")
export class ChatMessages extends LitElement {
  static styles = [messageStyles, markdownStyles, css`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; position: relative; }
    .messages { flex: 1; overflow-y: auto; padding: var(--gutter, 24px) 0; display: flex; flex-direction: column; gap: 20px; }
    @media (max-width: 768px) {
      .bubble { font-size: 13px; }
      .indent { margin-left: 0; }
    }
    .btn-open-file {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 2px 8px; border-radius: 4px;
      background: none; border: 1px solid var(--border-divider);
      color: var(--text-tertiary); font-size: 10px; font-weight: 500;
      font-family: inherit; cursor: pointer; flex-shrink: 0;
      transition: all 150ms ease;
    }
    .btn-open-file:hover {
      background: var(--wash); color: var(--text-primary);
      border-color: var(--border-strong);
    }
    .btn-open-file svg { stroke: currentColor; stroke-width: 2; fill: none; }
    .file-toast {
      position: absolute; bottom: 16px; left: 50%;
      transform: translateX(-50%);
      background: var(--dark); color: #FDFEFD;
      font-size: 12px; font-weight: 500;
      padding: 6px 16px; border-radius: 999px;
      box-shadow: var(--shadow-raised);
      animation: toast-in 200ms ease;
      z-index: 20; pointer-events: none;
    }
    @keyframes toast-in {
      from { opacity: 0; transform: translateX(-50%) translateY(8px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    .warning-card {
      background: color-mix(in srgb, var(--warning-subtle) 88%, white);
      border: 1px solid color-mix(in srgb, var(--warning) 26%, transparent);
      border-left: 3px solid var(--warning);
      border-radius: 12px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .warning-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--warning);
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .warning-title code {
      font-family: var(--mono);
      font-size: 10px;
      color: color-mix(in srgb, var(--warning) 78%, black);
      background: color-mix(in srgb, var(--warning-subtle) 70%, white);
      border: 1px solid color-mix(in srgb, var(--warning) 18%, transparent);
      border-radius: 6px;
      padding: 1px 6px;
      line-height: 1.4;
    }
    .warning-text {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .warning-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .warning-action {
      border: 1px solid var(--border-strong);
      background: var(--surface-1);
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 600;
      border-radius: 999px;
      height: 28px;
      padding: 0 12px;
      font-family: inherit;
      cursor: pointer;
      transition: all 140ms ease;
    }
    .warning-action:hover {
      background: var(--wash);
      color: var(--text-primary);
    }
    .warning-action.primary {
      border-color: color-mix(in srgb, var(--warning) 36%, transparent);
      background: color-mix(in srgb, var(--warning-subtle) 72%, white);
      color: var(--warning);
    }
    .warning-action.primary:hover {
      background: color-mix(in srgb, var(--warning-subtle) 58%, white);
    }
    .warning-action:disabled {
      opacity: 0.62;
      cursor: not-allowed;
    }
    .warning-mode {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      color: var(--text-tertiary);
      font-family: var(--mono);
    }
    .warning-mode-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--border-strong) 78%, transparent);
      background: var(--surface-1);
      color: var(--text-secondary);
      padding: 2px 7px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.28px;
      text-transform: uppercase;
      line-height: 1.1;
    }
    .warning-mode-badge.strict {
      color: var(--success);
      border-color: color-mix(in srgb, var(--success) 32%, transparent);
      background: color-mix(in srgb, var(--success) 8%, white);
    }
    .warning-mode-badge.open {
      color: var(--danger);
      border-color: color-mix(in srgb, var(--danger) 30%, transparent);
      background: color-mix(in srgb, var(--danger-subtle) 72%, white);
    }
    .warning-mode-badge.once {
      color: var(--warning);
      border-color: color-mix(in srgb, var(--warning) 36%, transparent);
      background: color-mix(in srgb, var(--warning-subtle) 72%, white);
    }
  `];

  @property({ type: Array }) entries: ChatEntry[] = [];
  @property({ type: Boolean }) loading = false;
  @property({ type: Number }) currentIter = 0;
  @property({ type: Number }) maxIter = 0;
  @property({ type: Boolean }) allowIrreversibleActions = false;
  @property({ type: Boolean }) allowIrreversibleOnceArmed = false;
  @property({ type: Boolean }) undoGuardApplying = false;
  @state() private playingMsgIndex = -1;
  @state() private collapsedTools = new Set<number>();
  @state() private approvalCountdowns = new Map<string, number>();
  private countdownTimers = new Map<string, ReturnType<typeof setInterval>>();
  private currentAudio: HTMLAudioElement | null = null;
  @state() private fileToast = "";
  @query(".messages") private messagesEl!: HTMLElement;

  private showFileToast(message: string) {
    this.fileToast = message;
    setTimeout(() => {
      if (this.fileToast === message) {
        this.fileToast = "";
      }
    }, 2500);
  }

  private async downloadFile(filePath: string) {
    const { blob, fileName } = await api.files.download(filePath);
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  private async openFile(filePath: string, e: Event) {
    e.stopPropagation();
    try {
      await api.files.open(filePath);
    } catch {
      try {
        await this.downloadFile(filePath);
        this.showFileToast("File downloaded");
      } catch {
        try {
          await navigator.clipboard.writeText(filePath);
          this.showFileToast("Path copied to clipboard");
        } catch {
          this.showFileToast("Could not open or download file");
        }
      }
    }
  }

  private toggleCollapse(index: number) {
    const next = new Set(this.collapsedTools);
    if (next.has(index)) next.delete(index); else next.add(index);
    this.collapsedTools = next;
  }

  updated(changed: Map<string, unknown>) {
    super.updated(changed);
    if (changed.has("entries")) this.scrollDown();
  }

  scrollDown() {
    requestAnimationFrame(() => { if (this.messagesEl) this.messagesEl.scrollTop = this.messagesEl.scrollHeight; });
  }

  // ── TTS ──

  private async speakText(text: string, msgIndex: number) {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
      if (this.playingMsgIndex === msgIndex) {
        this.playingMsgIndex = -1;
        return;
      }
    }

    this.playingMsgIndex = msgIndex;
    try {
      const ttsStatus = await api.gateway.tts.status().catch(() => null);
      if (ttsStatus && !ttsStatus.enabled) {
        throw new Error("Voice is disabled. Enable it in Settings → Voice.");
      }

      const res = await fetch("/api/chat/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `TTS failed`);
      }

      const audioBlob = await res.blob();
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      this.currentAudio = audio;

      audio.onended = () => {
        this.playingMsgIndex = -1;
        this.currentAudio = null;
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        this.playingMsgIndex = -1;
        this.currentAudio = null;
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch (err) {
      this.dispatchEvent(new CustomEvent("chat-error", { detail: `Voice playback failed: ${err}`, bubbles: true, composed: true }));
      this.playingMsgIndex = -1;
    }
  }

  // ── Helpers ──

  private fmtArgs(args: Record<string, unknown>) {
    return Object.entries(args).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
  }

  private fmtResult(result: unknown) {
    if (typeof result === "object" && result !== null) return JSON.stringify(result, null, 2);
    return String(result);
  }

  private toolCategory(name: string): "exec" | "file" | "search" | "web" | "generic" {
    if (["exec", "process"].includes(name)) return "exec";
    if (["edit_file", "write_file", "read_file", "file_info"].includes(name)) return "file";
    if (["codebase_search", "project_info", "system_info"].includes(name)) return "search";
    if (["browse_page", "browser", "web_fetch"].includes(name)) return "web";
    return "generic";
  }

  private toolIcon(cat: string) {
    const icons: Record<string, string> = {
      exec: "M4 17l6-6-6-6M12 19h8",
      file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
      search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.35-4.35",
      web: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20",
      generic: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
    };
    return html`<svg class="tool-card-icon" viewBox="0 0 24 24"><path d="${icons[cat] ?? icons.generic}"/></svg>`;
  }

  private toolBadgeClass(cat: string) {
    const m: Record<string, string> = { exec: "badge-exec", file: "badge-file", search: "badge-search", web: "badge-web" };
    return m[cat] ?? "badge-tool";
  }

  private fileExt(path: string): string {
    const dot = path.lastIndexOf(".");
    return dot >= 0 ? path.slice(dot + 1) : "";
  }

  private langLabel(ext: string): string {
    const m: Record<string, string> = { ts: "TS", tsx: "TSX", js: "JS", jsx: "JSX", py: "PY", rs: "RS", go: "GO", css: "CSS", html: "HTML", json: "JSON", md: "MD", sh: "SH", yml: "YAML", yaml: "YAML" };
    return m[ext] ?? ext.toUpperCase();
  }

  private shortPath(p: string): string {
    const parts = p.split("/");
    return parts.length > 2 ? parts.slice(-2).join("/") : p;
  }

  // ── Approval ──

  private startCountdown(id: string) {
    if (this.countdownTimers.has(id)) return;
    const next = new Map(this.approvalCountdowns);
    next.set(id, 300);
    this.approvalCountdowns = next;
    const timer = setInterval(() => {
      const cur = this.approvalCountdowns.get(id) ?? 0;
      if (cur <= 1) {
        clearInterval(timer);
        this.countdownTimers.delete(id);
        this.handleApproval(id, false, false);
        return;
      }
      const upd = new Map(this.approvalCountdowns);
      upd.set(id, cur - 1);
      this.approvalCountdowns = upd;
    }, 1000);
    this.countdownTimers.set(id, timer);
  }

  private handleApproval(id: string, approved: boolean, allowAlways = false) {
    const timer = this.countdownTimers.get(id);
    if (timer) { clearInterval(timer); this.countdownTimers.delete(id); }
    this.dispatchEvent(new CustomEvent("handle-approval", { detail: { id, approved, allowAlways }, bubbles: true, composed: true }));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    for (const timer of this.countdownTimers.values()) clearInterval(timer);
    this.countdownTimers.clear();
  }

  private fmtCountdown(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  private emitUndoGuardAllowOnce() {
    this.dispatchEvent(
      new CustomEvent("undo-guard-allow-once", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private emitUndoGuardKeepStrict() {
    this.dispatchEvent(
      new CustomEvent("undo-guard-keep-strict", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private undoModeLabel(): string {
    if (this.allowIrreversibleOnceArmed) return "open once";
    return this.allowIrreversibleActions ? "open" : "strict";
  }

  private undoModeBadgeClass(): string {
    if (this.allowIrreversibleOnceArmed) return "warning-mode-badge once";
    return this.allowIrreversibleActions
      ? "warning-mode-badge open"
      : "warning-mode-badge strict";
  }

  // ── Render entries ──

  private renderEntry(e: ChatEntry, index: number) {
    if (e.kind === "user") {
      return html`<div class="msg-rail"><div class="row"><div class="avatar avatar-user">U</div><div class="bubble"><div class="role-label">You</div><div class="md-content">${unsafeHTML(renderMarkdown(e.content))}</div>${e.images?.length ? html`<div class="user-images">${e.images.map((src) => html`<img class="user-image" src=${src} alt="attachment" @click=${() => window.open(src, "_blank")} />`)}</div>` : nothing}</div></div></div>`;
    }
    if (e.kind === "assistant") {
      const speakBtn = !e.streaming && e.content ? html`
        <button class="btn-speak" ?data-playing=${this.playingMsgIndex === index}
          @click=${() => this.speakText(e.content, index)} title="Listen">
          <svg class="speak-icon" viewBox="0 0 24 24">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg>
        </button>` : nothing;
      return html`<div class="msg-rail"><div class="row"><div class="avatar avatar-ai">A</div><div class="bubble"><div class="role-label">Undoable</div><div class="md-content">${unsafeHTML(renderMarkdown(e.content, !!e.streaming))}</div>${e.streaming ? html`<span class="cursor"></span>` : nothing}${!e.streaming && e.content ? html`<div class="msg-actions">${speakBtn}</div>` : nothing}</div></div></div>`;
    }
    if (e.kind === "thinking") {
      return html`
        <div class="msg-rail"><div class="indent">
          <details class="thinking-block" ?open=${!!e.streaming}>
            <summary class="thinking-header">
              <svg class="thinking-icon" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7zM9 21h6M12 17v4"/></svg>
              <span>Thinking${e.streaming ? html`<span class="cursor"></span>` : ""}</span>
            </summary>
            <div class="thinking-content">${e.content}</div>
          </details>
        </div></div>`;
    }
    if (e.kind === "tool_call") {
      const cat = this.toolCategory(e.name);
      const iter = e.iteration && e.maxIterations ? html`<span class="tool-iter">${e.iteration}/${e.maxIterations}</span>` : nothing;
      const isProcess = e.name === "process";
      const filePath = (e.args.path ?? e.args.file_path ?? e.args.file ?? "") as string;
      const ext = filePath ? this.fileExt(filePath) : "";
      const titleText = isProcess ? `process ${e.args.action ?? ""}` as string
        : cat === "file" && filePath ? this.shortPath(filePath)
          : cat === "exec" ? (e.args.command as string ?? e.name)
            : e.name;
      const badgeText = isProcess ? (e.args.action as string ?? "exec")
        : ext ? this.langLabel(ext) : cat;
      return html`
        <div class="msg-rail"><div class="indent"><div class="tool-card pending">
          <div class="tool-card-header">
            ${this.toolIcon(cat)}
            <span class="tool-card-title">${titleText}</span>
            <span class="tool-badge ${this.toolBadgeClass(cat)}">${badgeText}</span>
            ${iter}
            ${cat === "file" && filePath ? html`
              <button class="btn-open-file" @click=${(ev: Event) => this.openFile(filePath, ev)} title="Open file">
                <svg viewBox="0 0 24 24" width="12" height="12"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Open
              </button>
            ` : nothing}
          </div>
          <div class="tool-card-body">
            ${isProcess ? html`<div class="exec-cmd">${e.args.sessionId ? html`<b>session</b> ${e.args.sessionId}` : ""}${e.args.waitMs ? html` <b>wait</b> ${e.args.waitMs}ms` : ""}</div>`
          : cat === "exec" ? html`<div class="exec-cmd"><b>$</b> ${e.args.command ?? ""}</div>`
            : cat === "file" && e.args.new_string ? html`<div class="code-block">${e.args.new_string}</div>`
              : cat === "file" && e.args.content ? html`<div class="code-block">${e.args.content}</div>`
                : html`<div class="generic-detail">${this.fmtArgs(e.args)}</div>`}
          </div>
        </div></div></div>`;
    }
    if (e.kind === "tool_result") {
      const cat = this.toolCategory(e.name ?? "");
      const isProcess = e.name === "process";
      const resultObj = typeof e.result === "object" && e.result !== null ? e.result as Record<string, unknown> : null;
      const isError = resultObj !== null && "error" in resultObj;
      const execTail = resultObj?.tail as string | undefined;
      const execStatus = resultObj?.status as string | undefined;
      const execCmd = resultObj?.command as string | undefined;
      const resultFilePath = (resultObj?.path ?? resultObj?.file_path ?? "") as string;
      const resultStr = isProcess && execTail ? execTail : this.fmtResult(e.result);
      const titleText = isProcess && execCmd ? `${execCmd.slice(0, 80)}` : (e.name ?? "result");
      const badgeLabel = isError ? "error" : isProcess ? (execStatus ?? "done") : "done";
      const badgeCls = isError ? "badge-exec" : execStatus === "running" ? "badge-search" : this.toolBadgeClass(cat);
      const collapsed = this.collapsedTools.has(index);
      const longOutput = resultStr.length > 200;
      return html`
        <div class="msg-rail"><div class="indent"><div class="tool-card done">
          <div class="tool-card-header" @click=${() => longOutput && this.toggleCollapse(index)} style="${longOutput ? "cursor:pointer" : ""}">
            ${this.toolIcon(cat)}
            <span class="tool-card-title">${titleText}</span>
            <span class="tool-badge ${badgeCls}">${badgeLabel}</span>
            ${cat === "file" && resultFilePath ? html`
              <button class="btn-open-file" @click=${(ev: Event) => this.openFile(resultFilePath, ev)} title="Open file">
                <svg viewBox="0 0 24 24" width="12" height="12"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Open
              </button>
            ` : nothing}
            ${longOutput ? html`
              <svg class="tool-collapse-icon ${collapsed ? "collapsed" : ""}" viewBox="0 0 24 24" width="14" height="14"><path d="M6 9l6 6 6-6"/></svg>
            ` : nothing}
          </div>
          ${!collapsed ? html`
            <div class="tool-card-body">
              ${cat === "exec" ? html`<div class="exec-output">${resultStr}</div>`
            : cat === "file" ? html`<div class="code-block">${resultStr}</div>`
              : html`<div class="generic-detail">${resultStr}</div>`}
            </div>
          ` : nothing}
        </div></div></div>`;
    }
    if (e.kind === "approval") {
      const resolved = e.resolved;
      if (!resolved && !this.approvalCountdowns.has(e.id)) this.startCountdown(e.id);
      const countdown = this.approvalCountdowns.get(e.id) ?? 0;
      const headerCls = resolved ? (e.approved ? "done" : "") : "pending";
      return html`
        <div class="msg-rail"><div class="indent"><div class="tool-card ${headerCls}" style="${resolved ? "opacity:0.6" : ""}">
          <div class="tool-card-header" style="border-left-color: ${resolved ? (e.approved ? "var(--accent)" : "var(--danger)") : "var(--warning)"}; border-left-width: 2px; border-left-style: solid;">
            <svg class="tool-card-icon" style="color: ${resolved ? (e.approved ? "var(--accent)" : "var(--danger)") : "var(--warning)"}" viewBox="0 0 24 24"><path d="${resolved ? (e.approved ? "M20 6L9 17l-5-5" : "M18 6L6 18M6 6l12 12") : "M12 9v4M12 17h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"}"/></svg>
            <span class="tool-card-title">${e.tool ?? "unknown"}</span>
            <span class="tool-badge" style="background: ${resolved ? (e.approved ? "var(--accent-subtle)" : "var(--danger-subtle)") : "var(--warning-subtle)"}; color: ${resolved ? (e.approved ? "var(--accent)" : "var(--danger)") : "var(--warning)"}">
              ${resolved ? (e.approved ? "approved" : "rejected") : "pending"}
            </span>
            ${!resolved && countdown > 0 ? html`<span class="approval-timer">${this.fmtCountdown(countdown)}</span>` : nothing}
          </div>
          <div class="tool-card-body tool-card-body-pad">
            ${e.description ? html`<div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 6px;">${e.description}</div>` : nothing}
            ${e.args ? html`<div class="generic-detail" style="padding: 6px 8px; margin: 0; border-radius: 6px;">${this.fmtArgs(e.args)}</div>` : nothing}
            ${!resolved ? html`
              <div class="approval-actions" style="margin-top: 10px;">
                <button class="btn-approve" @click=${() => this.handleApproval(e.id, true)}>Approve</button>
                <button class="btn-approve" style="background: var(--surface-1); color: var(--dark); border: 1px solid var(--border-strong);" @click=${() => this.handleApproval(e.id, true, true)}>Allow Always</button>
                <button class="btn-reject" @click=${() => this.handleApproval(e.id, false)}>Reject</button>
              </div>
            ` : nothing}
          </div>
        </div></div></div>
      `;
    }
    if (e.kind === "warning") {
      if (e.code === "undo_guarantee_blocked" || e.actionable) {
        return html`
          <div class="msg-rail">
            <div class="indent">
              <div class="warning-card">
                <div class="warning-title">
                  Undo Guarantee blocked
                  ${e.tool ? html`<code>${e.tool}</code>` : nothing}
                </div>
                <div class="warning-text">${e.content}</div>
                ${e.recovery ? html`<div class="warning-text">${e.recovery}</div>` : nothing}
                <div class="warning-mode">
                  Mode
                  <span class="${this.undoModeBadgeClass()}">${this.undoModeLabel()}</span>
                </div>
                <div class="warning-actions">
                  ${!this.allowIrreversibleActions
                    ? html`
                        <button
                          class="warning-action primary"
                          ?disabled=${this.undoGuardApplying}
                          @click=${this.emitUndoGuardAllowOnce}
                        >
                          ${this.undoGuardApplying
                            ? "Allowing..."
                            : "Allow Once and Continue"}
                        </button>
                      `
                    : nothing}
                  <button
                    class="warning-action"
                    @click=${this.emitUndoGuardKeepStrict}
                  >
                    Keep Strict
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }
      return html`<div class="msg-rail"><div class="indent"><div class="warning-inner">${e.content}</div></div></div>`;
    }
    return nothing;
  }

  private renderProgress() {
    if (!this.loading || this.currentIter === 0 || this.maxIter === 0) return nothing;
    const pct = Math.min((this.currentIter / this.maxIter) * 100, 100);
    return html`
      <div class="msg-rail"><div class="indent"><div class="progress-inner">
        <div class="progress-track"><div class="progress-fill" style="width: ${pct}%"></div></div>
        <span class="progress-label">${this.currentIter}/${this.maxIter}</span>
      </div></div></div>
    `;
  }

  render() {
    return html`
      <div class="messages">
        ${this.entries.map((e, i) => this.renderEntry(e, i))}
        ${this.renderProgress()}
      </div>
      ${this.fileToast ? html`<div class="file-toast">${this.fileToast}</div>` : nothing}
    `;
  }
}
