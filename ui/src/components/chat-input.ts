import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { inputStyles, voiceStyles } from "./chat-styles.js";

type PendingFile = {
  fileName: string;
  mimeType: string;
  content: string;
  preview?: string;
};

type ApiErrorPayload = {
  error?: string;
  recovery?: string;
};

const DEFAULT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_TRANSCRIBE_MAX_BYTES = 20 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 120;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

@customElement("chat-input")
export class ChatInput extends LitElement {
  static styles = [
    inputStyles,
    voiceStyles,
    css`
      :host {
        display: block;
        flex-shrink: 0;
      }
      .toolbar-spacer {
        flex: 1;
      }

      /* Prominent Undo/Redo Action Bar */
      .undo-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 16px;
        margin: 0 auto 8px;
        max-width: var(--content-w);
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--mint) 12%, var(--surface-1)),
          var(--surface-1)
        );
        border: 1px solid var(--mint-strong);
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(46, 69, 57, 0.08);
      }
      .undo-bar-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-right: 4px;
      }
      .undo-bar-divider {
        width: 1px;
        height: 20px;
        background: var(--border-strong);
        margin: 0 4px;
      }
      .btn-undo-main {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: var(--radius-pill);
        background: var(--mint);
        color: var(--dark);
        font-size: 12px;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition: all 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
        box-shadow: 0 2px 6px rgba(46, 69, 57, 0.15);
      }
      .btn-undo-main:hover:not(:disabled) {
        background: var(--mint-strong);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(46, 69, 57, 0.2);
      }
      .btn-undo-main:active:not(:disabled) {
        transform: translateY(0);
      }
      .btn-undo-main:disabled {
        background: var(--wash);
        color: var(--text-tertiary);
        cursor: not-allowed;
        box-shadow: none;
      }
      .btn-undo-main svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        stroke-width: 2;
        fill: none;
      }
      .btn-undo-secondary {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border-radius: var(--radius-pill);
        background: var(--surface-1);
        color: var(--text-secondary);
        font-size: 11px;
        font-weight: 500;
        border: 1px solid var(--border-strong);
        cursor: pointer;
        transition: all 150ms ease;
      }
      .btn-undo-secondary:hover:not(:disabled) {
        background: var(--wash);
        border-color: var(--mint-strong);
        color: var(--text-primary);
      }
      .btn-undo-secondary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-undo-secondary svg {
        width: 12px;
        height: 12px;
        stroke: currentColor;
        stroke-width: 2;
        fill: none;
      }

      .btn-stop {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--danger, #e74c3c);
        border: none;
        cursor: pointer;
        transition: all 150ms ease;
        flex-shrink: 0;
      }
      .btn-stop:hover {
        background: var(--danger-hover, #c0392b);
        transform: scale(1.05);
      }
      .btn-stop svg {
        width: 14px;
        height: 14px;
        fill: white;
        stroke: none;
      }
      .btn-stop:active {
        transform: scale(0.95);
      }
      @media (max-width: 768px) {
        .input-area {
          padding: 0 12px 12px;
        }
        .input-box {
          padding: 10px;
          border-radius: 16px;
        }
        .undo-bar {
          padding: 8px 12px;
          gap: 6px;
        }
        .btn-undo-main {
          padding: 6px 12px;
          font-size: 11px;
        }
        .btn-undo-secondary {
          padding: 5px 10px;
          font-size: 10px;
        }
      }
    `,
  ];

  @property({ type: Boolean }) loading = false;
  @property({ type: String }) thinkingLevel = "";
  @property({ type: Boolean }) canThink = false;
  @property({ type: Boolean }) hasUndoable = false;
  @property({ type: Boolean }) hasRedoable = false;
  @property({ type: Number }) attachmentLimitBytes = DEFAULT_ATTACHMENT_MAX_BYTES;
  @property({ type: Number }) transcribeLimitBytes = DEFAULT_TRANSCRIBE_MAX_BYTES;
  @state() private input = "";
  @state() private pendingFiles: PendingFile[] = [];
  @state() private dragOver = false;
  @state() private recording = false;
  @state() private transcribing = false;
  @state() private recordingTime = 0;
  private mediaRecorder: MediaRecorder | null = null;
  private recordingChunks: Blob[] = [];
  private recordingTimer: ReturnType<typeof setInterval> | null = null;

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true }),
    );
  }

  // ── Auto-resize textarea ──

  private autoResize(textarea: HTMLTextAreaElement) {
    textarea.style.height = "auto";
    const maxH = 320;
    if (textarea.scrollHeight > maxH) {
      textarea.style.height = `${maxH}px`;
      textarea.style.overflowY = "auto";
    } else {
      textarea.style.height = `${textarea.scrollHeight}px`;
      textarea.style.overflowY = "hidden";
    }
  }

  private onInput(e: Event) {
    const ta = e.target as HTMLTextAreaElement;
    this.input = ta.value;
    this.autoResize(ta);
  }

  // ── Send ──

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.doSend();
    }
  }

  private doSend(voiceInitiated = false, overrideText?: string) {
    const text =
      overrideText !== undefined ? overrideText.trim() : this.input.trim();
    const hasFiles = this.pendingFiles.length > 0;
    if ((!text && !hasFiles) || this.loading) return;

    const attachments = hasFiles
      ? this.pendingFiles.map((f) => ({
          fileName: f.fileName,
          mimeType: f.mimeType,
          content: f.content,
        }))
      : undefined;

    this.emit("send-message", { text, attachments, voiceInitiated });
    this.input = "";
    this.pendingFiles = [];
    const ta = this.shadowRoot?.querySelector("textarea");
    if (ta) {
      ta.style.height = "auto";
      ta.style.overflowY = "hidden";
    }
  }

  // ── File handling ──

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  private async readApiError(res: Response, fallback: string): Promise<string> {
    const body = (await res.json().catch(() => ({}))) as ApiErrorPayload;
    const msg = body.error?.trim() || fallback;
    if (body.recovery?.trim()) return `${msg} ${body.recovery.trim()}`;
    return msg;
  }

  private async addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (file.size > this.attachmentLimitBytes) {
        this.emit(
          "chat-error",
          `${file.name} is too large (${formatBytes(file.size)}). Max is ${formatBytes(this.attachmentLimitBytes)}.`,
        );
        continue;
      }
      const content = await this.fileToBase64(file);
      const isImage = file.type.startsWith("image/");
      this.pendingFiles = [
        ...this.pendingFiles,
        {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          content,
          preview: isImage ? `data:${file.type};base64,${content}` : undefined,
        },
      ];
    }
  }

  private handleFilePick() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,.txt,.md,.json,.csv,.ts,.js,.py,.html,.css";
    input.onchange = () => {
      if (input.files) this.addFiles(input.files);
    };
    input.click();
  }

  private handleDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver = false;
    if (e.dataTransfer?.files?.length) this.addFiles(e.dataTransfer.files);
  }

  private handleDragOver(e: DragEvent) {
    e.preventDefault();
    this.dragOver = true;
  }
  private handleDragLeave() {
    this.dragOver = false;
  }

  private handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      this.addFiles(files);
    }
  }

  private removeAttachment(index: number) {
    this.pendingFiles = this.pendingFiles.filter((_, i) => i !== index);
  }

  // ── Voice recording ──

  private toggleRecording() {
    if (this.recording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  private async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recordingChunks = [];
      this.recordingTime = 0;
      this.recording = true;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordingChunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        this.recording = false;
        if (this.recordingTimer) {
          clearInterval(this.recordingTimer);
          this.recordingTimer = null;
        }
        if (this.recordingChunks.length === 0) return;
        const blob = new Blob(this.recordingChunks, { type: mimeType });
        await this.transcribeAudio(blob, mimeType);
      };

      this.mediaRecorder.start(250);
      this.recordingTimer = setInterval(() => {
        this.recordingTime++;
        if (this.recordingTime >= MAX_RECORDING_SECONDS) {
          this.emit(
            "chat-error",
            `Recording stopped at ${MAX_RECORDING_SECONDS}s. Short recordings are more reliable.`,
          );
          this.stopRecording();
        }
      }, 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit(
        "chat-error",
        `Microphone access failed: ${message}. Allow microphone permission and retry.`,
      );
      this.recording = false;
    }
  }

  private stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
  }

  private async transcribeAudio(blob: Blob, mime: string) {
    this.transcribing = true;
    try {
      if (blob.size > this.transcribeLimitBytes) {
        throw new Error(
          `Audio is too large (${formatBytes(blob.size)}). Max is ${formatBytes(this.transcribeLimitBytes)}.`,
        );
      }
      const base64 = await this.blobToBase64(blob);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);

      const res = await fetch("/api/chat/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64, mime }),
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timeout);
      });

      if (!res.ok) {
        throw new Error(
          await this.readApiError(
            res,
            `Transcription request failed (HTTP ${res.status})`,
          ),
        );
      }

      const data = (await res.json()) as { text: string };
      if (data.text && data.text.trim()) {
        this.doSend(true, data.text);
      } else {
        this.emit(
          "chat-error",
          "No speech detected. Try speaking louder or closer to the microphone.",
        );
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === "AbortError"
            ? "Transcription timed out. Try a shorter recording."
            : err.message
          : String(err);
      this.emit("chat-error", message);
    } finally {
      this.transcribing = false;
    }
  }

  private fmtRecTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // ── Render ──

  render() {
    return html`
      <div
        class="input-area"
        @dragover=${this.handleDragOver}
        @dragleave=${this.handleDragLeave}
        @drop=${this.handleDrop}
        style="position:relative;"
      >
        ${this.dragOver
          ? html`<div class="drop-overlay">Drop files here</div>`
          : nothing}

        <!-- Prominent Undo/Redo Bar -->
        ${!this.loading
          ? html`
              <div class="undo-bar">
                <span class="undo-bar-label">History</span>
                <button
                  class="btn-undo-main"
                  ?disabled=${!this.hasUndoable}
                  @click=${() => this.emit("undo", "last")}
                  title="Undo last action"
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M3 10h10a5 5 0 0 1 0 10H12" />
                    <path d="M3 10l4-4M3 10l4 4" />
                  </svg>
                  Undo
                </button>
                <button
                  class="btn-undo-main"
                  ?disabled=${!this.hasRedoable}
                  @click=${() => this.emit("redo", "last")}
                  title="Redo last undone action"
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M21 10H11a5 5 0 0 0 0 10h1" />
                    <path d="M21 10l-4-4M21 10l-4 4" />
                  </svg>
                  Redo
                </button>
                <div class="undo-bar-divider"></div>
                <button
                  class="btn-undo-secondary"
                  ?disabled=${!this.hasUndoable}
                  @click=${() => this.emit("undo", "all")}
                  title="Undo all actions"
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M11 19l-7-7 7-7" />
                    <path d="M18 19l-7-7 7-7" />
                  </svg>
                  Undo All
                </button>
              </div>
            `
          : nothing}
        ${this.pendingFiles.length > 0
          ? html`
              <div
                class="attachment-row"
                style="max-width: var(--content-w); width: 100%; margin: 0 auto; padding: 0 0 4px;"
              >
                ${this.pendingFiles.map(
                  (f, i) => html`
                    <div class="attachment-chip">
                      ${f.preview
                        ? html`<img
                            class="attachment-thumb"
                            src=${f.preview}
                            alt=${f.fileName}
                          />`
                        : html`<div class="attachment-icon">
                            ${f.fileName.split(".").pop() ?? "?"}
                          </div>`}
                      <span class="attachment-name">${f.fileName}</span>
                      <button
                        class="attachment-remove"
                        @click=${() => this.removeAttachment(i)}
                      >
                        ×
                      </button>
                    </div>
                  `,
                )}
              </div>
            `
          : nothing}
        <div class="input-box">
          <div class="input-top">
            <div class="input-search-icon">
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            ${this.recording
              ? html`
                  <div class="recording-bar">
                    <div class="recording-dot"></div>
                    <span>Recording...</span>
                    <span class="recording-time"
                      >${this.fmtRecTime(this.recordingTime)}</span
                    >
                  </div>
                `
              : this.transcribing
                ? html`
                    <div class="voice-transcribing">Transcribing audio...</div>
                  `
                : html`
                    <textarea
                      rows="1"
                      placeholder="Message Undoable..."
                      .value=${this.input}
                      @input=${this.onInput}
                      @keydown=${this.onKeyDown}
                      @paste=${this.handlePaste}
                    ></textarea>
                  `}
            ${this.loading
              ? html`
                  <button
                    class="btn-stop"
                    @click=${() => this.emit("abort-chat")}
                    title="Stop generation"
                  >
                    <svg viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  </button>
                `
              : html`
                  <button
                    class="btn-send"
                    ?disabled=${this.recording ||
                    this.transcribing ||
                    (!this.input.trim() && this.pendingFiles.length === 0)}
                    @click=${() => this.doSend(false)}
                  >
                    <svg class="send-icon" viewBox="0 0 24 24">
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                  </button>
                `}
          </div>
          <div class="input-divider"></div>
          <div class="input-toolbar">
            <button
              class="btn-attach"
              @click=${this.handleFilePick}
              title="Attach files"
            >
              <svg class="attach-icon" viewBox="0 0 24 24">
                <path
                  d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                />
              </svg>
              <span>Attach</span>
            </button>
            <button
              class="btn-mic"
              ?data-recording=${this.recording}
              @click=${this.toggleRecording}
              title=${this.recording ? "Stop recording" : "Voice input"}
            >
              <svg class="mic-icon" viewBox="0 0 24 24">
                <path
                  d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <span>Voice</span>
            </button>
            ${this.canThink
              ? html`
                  <button
                    class="btn-think ${this.thinkingLevel &&
                    this.thinkingLevel !== "off"
                      ? "think-active"
                      : ""}"
                    @click=${() => this.emit("cycle-thinking")}
                    title=${`Thinking: ${this.thinkingLevel || "off"}. Click to cycle.`}
                  >
                    <svg class="think-icon" viewBox="0 0 24 24">
                      <path
                        d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7zM9 21h6M12 17v4"
                      />
                    </svg>
                    <span
                      >${this.thinkingLevel && this.thinkingLevel !== "off"
                        ? this.thinkingLevel
                        : "Think"}</span
                    >
                  </button>
                `
              : nothing}
          </div>
        </div>
      </div>
    `;
  }
}
