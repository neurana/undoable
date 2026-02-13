import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import { messageStyles } from "./chat-styles.js";
import type { ChatEntry } from "./chat-types.js";

@customElement("chat-messages")
export class ChatMessages extends LitElement {
  static styles = [messageStyles, css`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
    .messages { flex: 1; overflow-y: auto; padding: var(--gutter, 24px) 0; display: flex; flex-direction: column; gap: 20px; }
    @media (max-width: 768px) {
      .bubble { font-size: 13px; }
      .indent { margin-left: 0; }
    }
  `];

  @property({ type: Array }) entries: ChatEntry[] = [];
  @property({ type: Boolean }) loading = false;
  @property({ type: Number }) currentIter = 0;
  @property({ type: Number }) maxIter = 0;
  @state() private playingMsgIndex = -1;
  private currentAudio: HTMLAudioElement | null = null;
  @query(".messages") private messagesEl!: HTMLElement;

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

  private handleApproval(id: string, approved: boolean) {
    this.dispatchEvent(new CustomEvent("handle-approval", { detail: { id, approved }, bubbles: true, composed: true }));
  }

  // ── Render entries ──

  private renderEntry(e: ChatEntry, index: number) {
    if (e.kind === "user") {
      return html`<div class="msg-rail"><div class="row"><div class="avatar avatar-user">U</div><div class="bubble"><div class="role-label">You</div>${e.content}</div></div></div>`;
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
      return html`<div class="msg-rail"><div class="row"><div class="avatar avatar-ai">A</div><div class="bubble"><div class="role-label">Undoable</div>${e.content}${e.streaming ? html`<span class="cursor"></span>` : nothing}${!e.streaming && e.content ? html`<div class="msg-actions">${speakBtn}</div>` : nothing}</div></div></div>`;
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
      const resultStr = isProcess && execTail ? execTail : this.fmtResult(e.result);
      const titleText = isProcess && execCmd ? `${execCmd.slice(0, 80)}` : (e.name ?? "result");
      const badgeLabel = isError ? "error" : isProcess ? (execStatus ?? "done") : "done";
      const badgeCls = isError ? "badge-exec" : execStatus === "running" ? "badge-search" : this.toolBadgeClass(cat);
      return html`
        <div class="msg-rail"><div class="indent"><div class="tool-card done">
          <div class="tool-card-header">
            ${this.toolIcon(cat)}
            <span class="tool-card-title">${titleText}</span>
            <span class="tool-badge ${badgeCls}">${badgeLabel}</span>
          </div>
          <div class="tool-card-body">
            ${cat === "exec" ? html`<div class="exec-output">${resultStr}</div>`
          : cat === "file" ? html`<div class="code-block">${resultStr}</div>`
            : html`<div class="generic-detail">${resultStr}</div>`}
          </div>
        </div></div></div>`;
    }
    if (e.kind === "approval") {
      const resolved = e.resolved;
      const headerCls = resolved ? (e.approved ? "done" : "") : "pending";
      return html`
        <div class="msg-rail"><div class="indent"><div class="tool-card ${headerCls}" style="${resolved ? "opacity:0.6" : ""}">
          <div class="tool-card-header" style="border-left-color: ${resolved ? (e.approved ? "var(--accent)" : "var(--danger)") : "var(--warning)"}; border-left-width: 2px; border-left-style: solid;">
            <svg class="tool-card-icon" style="color: ${resolved ? (e.approved ? "var(--accent)" : "var(--danger)") : "var(--warning)"}" viewBox="0 0 24 24"><path d="${resolved ? (e.approved ? "M20 6L9 17l-5-5" : "M18 6L6 18M6 6l12 12") : "M12 9v4M12 17h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"}"/></svg>
            <span class="tool-card-title">${e.tool ?? "unknown"}</span>
            <span class="tool-badge" style="background: ${resolved ? (e.approved ? "var(--accent-subtle)" : "var(--danger-subtle)") : "var(--warning-subtle)"}; color: ${resolved ? (e.approved ? "var(--accent)" : "var(--danger)") : "var(--warning)"}">
              ${resolved ? (e.approved ? "approved" : "rejected") : "pending"}
            </span>
          </div>
          <div class="tool-card-body tool-card-body-pad">
            ${e.description ? html`<div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 6px;">${e.description}</div>` : nothing}
            ${e.args ? html`<div class="generic-detail" style="padding: 6px 8px; margin: 0; border-radius: 6px;">${this.fmtArgs(e.args)}</div>` : nothing}
            ${!resolved ? html`
              <div class="approval-actions" style="margin-top: 10px;">
                <button class="btn-approve" @click=${() => this.handleApproval(e.id, true)}>Approve</button>
                <button class="btn-reject" @click=${() => this.handleApproval(e.id, false)}>Reject</button>
              </div>
            ` : nothing}
          </div>
        </div></div></div>
      `;
    }
    if (e.kind === "warning") {
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
    `;
  }
}
