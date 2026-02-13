import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { inputStyles, voiceStyles } from "./chat-styles.js";

type PendingFile = { fileName: string; mimeType: string; content: string; preview?: string };

@customElement("chat-input")
export class ChatInput extends LitElement {
  static styles = [inputStyles, voiceStyles, css`
    :host { display: block; flex-shrink: 0; }
    @media (max-width: 768px) {
      .input-area { padding: 0 12px 12px; }
      .input-box { padding: 10px; border-radius: 16px; }
    }
  `];

  @property({ type: Boolean }) loading = false;
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
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  // ── Send ──

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.doSend(); }
  }

  private doSend() {
    const text = this.input.trim();
    const hasFiles = this.pendingFiles.length > 0;
    if ((!text && !hasFiles) || this.loading) return;

    const attachments = hasFiles ? this.pendingFiles.map((f) => ({
      fileName: f.fileName, mimeType: f.mimeType, content: f.content,
    })) : undefined;

    this.emit("send-message", { text, attachments });
    this.input = "";
    this.pendingFiles = [];
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

  private async addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (file.size > 5_000_000) {
        this.emit("chat-error", `${file.name}: exceeds 5MB limit`);
        continue;
      }
      const content = await this.fileToBase64(file);
      const isImage = file.type.startsWith("image/");
      this.pendingFiles = [...this.pendingFiles, {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        content,
        preview: isImage ? `data:${file.type};base64,${content}` : undefined,
      }];
    }
  }

  private handleFilePick() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,.txt,.md,.json,.csv,.ts,.js,.py,.html,.css";
    input.onchange = () => { if (input.files) this.addFiles(input.files); };
    input.click();
  }

  private handleDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver = false;
    if (e.dataTransfer?.files?.length) this.addFiles(e.dataTransfer.files);
  }

  private handleDragOver(e: DragEvent) { e.preventDefault(); this.dragOver = true; }
  private handleDragLeave() { this.dragOver = false; }

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
    if (this.recording) { this.stopRecording(); } else { this.startRecording(); }
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
        if (this.recordingChunks.length === 0) return;
        const blob = new Blob(this.recordingChunks, { type: mimeType });
        this.recording = false;
        if (this.recordingTimer) { clearInterval(this.recordingTimer); this.recordingTimer = null; }
        await this.transcribeAudio(blob, mimeType);
      };

      this.mediaRecorder.start(250);
      this.recordingTimer = setInterval(() => { this.recordingTime++; }, 1000);
    } catch (err) {
      this.emit("chat-error", `Microphone access denied: ${err}`);
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
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const chunks: string[] = [];
      for (let i = 0; i < bytes.length; i += 8192) {
        chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
      }
      const base64 = btoa(chunks.join(""));

      const res = await fetch("/api/chat/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64, mime }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { text: string };
      if (data.text) {
        this.input = data.text;
        this.doSend();
      }
    } catch (err) {
      this.emit("chat-error", `Transcription failed: ${err}`);
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
      <div class="input-area" @dragover=${this.handleDragOver} @dragleave=${this.handleDragLeave} @drop=${this.handleDrop} style="position:relative;">
        ${this.dragOver ? html`<div class="drop-overlay">Drop files here</div>` : nothing}
        ${this.pendingFiles.length > 0 ? html`
          <div class="attachment-row" style="max-width: var(--content-w); width: 100%; margin: 0 auto; padding: 0 0 4px;">
            ${this.pendingFiles.map((f, i) => html`
              <div class="attachment-chip">
                ${f.preview ? html`<img class="attachment-thumb" src=${f.preview} alt=${f.fileName}/>` : html`<div class="attachment-icon">${f.fileName.split(".").pop() ?? "?"}</div>`}
                <span class="attachment-name">${f.fileName}</span>
                <button class="attachment-remove" @click=${() => this.removeAttachment(i)}>\u00d7</button>
              </div>
            `)}
          </div>
        ` : nothing}
        <div class="input-box">
          <div class="input-top">
            <div class="input-search-icon">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            ${this.recording ? html`
              <div class="recording-bar">
                <div class="recording-dot"></div>
                <span>Recording...</span>
                <span class="recording-time">${this.fmtRecTime(this.recordingTime)}</span>
              </div>
            ` : this.transcribing ? html`
              <div class="voice-transcribing">Transcribing audio...</div>
            ` : html`
              <textarea rows="1" placeholder="Message Undoable..." .value=${this.input}
                @input=${(e: Event) => this.input = (e.target as HTMLTextAreaElement).value}
                @keydown=${this.onKeyDown}
                @paste=${this.handlePaste}></textarea>
            `}
            <button class="btn-send" ?disabled=${this.loading || this.recording || this.transcribing || (!this.input.trim() && this.pendingFiles.length === 0)} @click=${this.doSend}>
              <svg class="send-icon" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </button>
          </div>
          <div class="input-divider"></div>
          <div class="input-toolbar">
            <button class="btn-attach" @click=${this.handleFilePick} title="Attach files">
              <svg class="attach-icon" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              <span>Attach</span>
            </button>
            <button class="btn-mic" ?data-recording=${this.recording}
              @click=${this.toggleRecording} title=${this.recording ? "Stop recording" : "Voice input"}>
              <svg class="mic-icon" viewBox="0 0 24 24">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
              <span>Voice</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
