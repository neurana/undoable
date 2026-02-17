import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type {
  ChatEntry,
  SessionItem,
  ApiMessage,
  SseEvent,
} from "./chat-types.js";
import { chatStyles, chatAreaStyles, responsiveStyles } from "./chat-styles.js";
import "./chat-sidebar.js";
import "./chat-input.js";
import "./chat-messages.js";
import "./chat-settings.js";
import "./canvas-panel.js";
import "./swarm-panel.js";
import { api, type UndoActionSummary } from "../api/client.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

@customElement("undoable-chat")
export class UndoableChat extends LitElement {
  static styles = [
    chatStyles,
    chatAreaStyles,
    responsiveStyles,
    css`
      .empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
        gap: 16px;
        padding-bottom: 40px;
      }
      .ant-logo {
        width: 140px;
        height: 140px;
      }
      .empty-title {
        font-size: 28px;
        font-weight: 400;
        color: var(--text-primary);
        letter-spacing: -0.02em;
        margin-top: 4px;
        font-family: var(--font-serif);
      }
      .empty-sub {
        font-size: 13px;
        max-width: 360px;
        text-align: center;
        line-height: 1.6;
        color: var(--text-secondary);
      }
      .error {
        color: var(--danger);
        font-size: 12px;
        max-width: var(--content-w);
        margin: 0 auto;
        padding: 6px var(--gutter) 6px calc(var(--gutter) + var(--col-offset));
      }
      .status-info {
        display: flex;
        align-items: center;
        gap: 14px;
        font-size: 11px;
        color: var(--text-tertiary);
      }
      .status-badge {
        padding: 2px 8px;
        border-radius: var(--radius-pill);
        font-weight: 600;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        border: 1px solid transparent;
      }
      .badge-interactive {
        background: var(--wash);
        color: var(--text-secondary);
        border-color: var(--border-strong);
      }
      .badge-autonomous {
        background: var(--danger-subtle);
        color: var(--danger);
        border-color: rgba(192, 57, 43, 0.15);
      }
      .badge-supervised {
        background: var(--accent-subtle);
        color: var(--dark);
        border-color: var(--mint-strong);
      }
      .badge-off {
        background: var(--bg-deep);
        color: var(--text-tertiary);
        border-color: var(--border-strong);
      }
      .badge-mutate {
        background: var(--warning-subtle);
        color: var(--warning);
        border-color: rgba(184, 134, 11, 0.15);
      }
      .badge-always {
        background: var(--danger-subtle);
        color: var(--danger);
        border-color: rgba(192, 57, 43, 0.15);
      }
      .badge-danger-skip {
        background: var(--danger-subtle);
        color: var(--danger);
        border-color: rgba(192, 57, 43, 0.2);
      }
      .usage-label {
        font-family: var(--mono);
        font-size: 10px;
        color: var(--text-tertiary);
        background: var(--wash);
        padding: 2px 8px;
        border-radius: var(--radius-pill);
        cursor: help;
      }
      .sidebar-backdrop {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(17, 26, 23, 0.25);
        z-index: 9;
      }
      .agent-selector {
        position: relative;
      }
      .agent-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: var(--radius-pill);
        background: var(--wash);
        color: var(--text-secondary);
        font-size: 11px;
        font-weight: 500;
        border: 1px solid var(--border-strong);
        cursor: pointer;
        transition: all 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
        white-space: nowrap;
      }
      .agent-btn:hover {
        background: var(--wash-strong);
        border-color: var(--mint-strong);
        color: var(--dark);
      }
      .agent-btn svg {
        width: 10px;
        height: 10px;
        stroke: currentColor;
        stroke-width: 2;
        fill: none;
      }
      .agent-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 4px;
        min-width: 200px;
        max-height: 240px;
        overflow-y: auto;
        background: var(--surface-1);
        border: 1px solid var(--border-strong);
        border-radius: var(--radius-sm);
        box-shadow: var(--shadow-raised);
        z-index: 20;
      }
      .agent-option {
        display: flex;
        flex-direction: column;
        gap: 1px;
        padding: 8px 12px;
        cursor: pointer;
        transition: background 120ms ease;
      }
      .agent-option:hover {
        background: var(--wash);
      }
      .agent-option.active {
        background: var(--accent-subtle);
      }
      .agent-option-name {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-primary);
      }
      .agent-option-model {
        font-size: 10px;
        color: var(--text-tertiary);
        font-family: var(--mono);
      }
      .btn-swarm-nav {
        height: 30px;
        padding: 0 10px;
        border-radius: var(--radius-pill);
        border: 1px solid var(--border-strong);
        background: var(--surface-1);
        color: var(--text-secondary);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
        flex-shrink: 0;
      }
      .btn-swarm-nav:hover {
        background: var(--wash);
        color: var(--text-primary);
        border-color: var(--mint-strong);
      }
      .btn-swarm-nav.active {
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--mint) 34%, transparent),
          var(--accent-subtle)
        );
        color: var(--dark);
        border-color: var(--mint-strong);
        box-shadow: inset 0 0 0 1px rgba(46, 69, 57, 0.14);
      }
      .btn-swarm-nav svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        stroke-width: 1.7;
        fill: none;
      }
      .btn-canvas {
        height: 30px;
        padding: 0 10px;
        border-radius: var(--radius-pill);
        border: 1px solid var(--border-strong);
        background: var(--surface-1);
        color: var(--text-secondary);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
        flex-shrink: 0;
      }
      .btn-canvas:hover {
        background: var(--wash);
        color: var(--text-primary);
        border-color: var(--mint-strong);
      }
      .btn-canvas.active {
        background: var(--accent-subtle);
        color: var(--dark);
        border-color: var(--mint-strong);
        box-shadow: inset 0 0 0 1px rgba(46, 69, 57, 0.14);
      }
      .btn-canvas svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        stroke-width: 1.7;
        fill: none;
      }
      .chat-content {
        flex: 1;
        min-height: 0;
        display: flex;
        overflow: hidden;
        position: relative;
      }
      .chat-main {
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .canvas-shell {
        position: relative;
        flex-shrink: 0;
        width: 0;
        min-width: 0;
        opacity: 0;
        transform: translateX(20px) scale(0.96);
        transform-origin: right center;
        margin: 0;
        padding: 10px 0 10px 0;
        box-sizing: border-box;
        border-left: 1px solid transparent;
        background: var(--bg-base);
        overflow: hidden;
        pointer-events: none;
        transition:
          width 260ms cubic-bezier(0.2, 0.8, 0.2, 1),
          opacity 220ms ease,
          transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1),
          border-color 180ms ease,
          margin 260ms cubic-bezier(0.2, 0.8, 0.2, 1),
          padding 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .canvas-shell.open {
        opacity: 1;
        transform: translateX(0) scale(1);
        border-left-color: var(--border-divider);
        margin-left: 8px;
        padding: 10px 12px 10px 12px;
        pointer-events: auto;
      }
      .canvas-shell-frame {
        width: 100%;
        height: 100%;
        min-height: 0;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 10px 28px rgba(17, 26, 23, 0.08);
      }
      .swarm-shell {
        position: relative;
        flex-shrink: 0;
        width: 0;
        min-width: 0;
        opacity: 0;
        transform: translateX(20px) scale(0.96);
        transform-origin: right center;
        margin: 0;
        padding: 10px 0 10px 0;
        box-sizing: border-box;
        border-left: 1px solid transparent;
        background: var(--bg-base);
        overflow: hidden;
        pointer-events: none;
        transition:
          width 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
          opacity 240ms ease,
          transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
          border-color 180ms ease,
          margin 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
          padding 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .swarm-shell.open {
        opacity: 1;
        transform: translateX(0) scale(1);
        border-left-color: var(--border-divider);
        margin-left: 8px;
        padding: 10px 12px 10px 12px;
        pointer-events: auto;
      }
      .resize-handle {
        position: absolute;
        left: -8px;
        top: 0;
        bottom: 0;
        width: 16px;
        cursor: col-resize;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: none;
      }
      .resize-handle::after {
        content: "";
        width: 4px;
        height: 48px;
        border-radius: 3px;
        background: var(--border-strong);
        opacity: 0.35;
        transition:
          opacity 150ms ease,
          background 150ms ease,
          width 150ms ease;
      }
      .resize-handle:hover::after {
        opacity: 1;
        width: 5px;
        background: var(--mint-strong);
      }
      .resize-handle.active::after {
        opacity: 1;
        width: 5px;
        background: var(--mint-strong);
        box-shadow: 0 0 8px rgba(46, 69, 57, 0.25);
      }
      .canvas-shell.resizing,
      .swarm-shell.resizing {
        transition: none;
      }
      .swarm-shell-frame {
        width: 100%;
        height: 100%;
        min-height: 0;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 10px 28px rgba(17, 26, 23, 0.08);
      }
      @media (max-width: 768px) {
        .sidebar-backdrop.visible {
          display: block;
        }
        .empty-title {
          font-size: 18px;
        }
        .ant-logo {
          width: 100px;
          height: 100px;
        }
        .btn-swarm-nav span {
          display: none;
        }
        .btn-swarm-nav {
          width: 32px;
          height: 32px;
          justify-content: center;
          padding: 0;
          border-radius: 8px;
        }
        .btn-canvas span {
          display: none;
        }
        .btn-canvas {
          width: 32px;
          height: 32px;
          justify-content: center;
          padding: 0;
          border-radius: 8px;
        }
        .chat-content {
          position: relative;
        }
        .canvas-shell {
          position: absolute;
          right: 8px;
          top: 8px;
          bottom: 8px;
          width: min(90vw, 420px);
          border-left: none;
          border: 1px solid transparent;
          border-radius: 14px;
          background: color-mix(in srgb, var(--bg-base) 92%, transparent);
          backdrop-filter: blur(3px);
          margin-left: 0;
          padding: 0;
        }
        .canvas-shell.open {
          width: min(90vw, 420px);
          border-color: var(--border-divider);
          margin-left: 0;
          padding: 6px;
        }
        .canvas-shell-frame {
          box-shadow: 0 14px 30px rgba(17, 26, 23, 0.18);
        }
        .swarm-shell {
          position: absolute;
          right: 4px;
          top: 4px;
          bottom: 4px;
          width: 0;
          border-left: none;
          border: 1px solid transparent;
          border-radius: 14px;
          background: color-mix(in srgb, var(--bg-base) 96%, transparent);
          backdrop-filter: blur(3px);
          margin-left: 0;
          padding: 0;
        }
        .swarm-shell.open {
          width: calc(100% - 8px);
          border-color: var(--border-divider);
          margin-left: 0;
          padding: 4px;
        }
        .swarm-shell-frame {
          box-shadow: 0 14px 30px rgba(17, 26, 23, 0.18);
        }
      }
      .iter-dialog-overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        background: rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: iter-fade-in 120ms ease;
      }
      @keyframes iter-fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      .iter-dialog {
        background: var(--surface-1);
        border: 1px solid var(--border-strong);
        border-radius: 14px;
        box-shadow: var(--shadow-raised);
        padding: 20px;
        width: 320px;
        max-width: 90vw;
        animation: iter-dialog-pop 150ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      @keyframes iter-dialog-pop {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      .iter-dialog-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 14px;
      }
      .iter-options {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 16px;
      }
      .iter-option {
        padding: 10px 8px;
        border-radius: 8px;
        border: 1px solid var(--border-strong);
        background: var(--surface-1);
        color: var(--text-secondary);
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        cursor: pointer;
        transition: all 120ms ease;
        text-align: center;
      }
      .iter-option:hover {
        background: var(--wash);
        border-color: var(--mint-strong);
        color: var(--text-primary);
      }
      .iter-option.active {
        background: var(--accent-subtle);
        border-color: var(--mint-strong);
        color: var(--dark);
      }
      .iter-option.unlimited {
        grid-column: span 3;
        background: var(--wash);
      }
      .iter-option.unlimited:hover {
        background: var(--accent-subtle);
      }
      .iter-dialog-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .iter-dialog-btn {
        padding: 7px 16px;
        border-radius: 8px;
        border: none;
        font-size: 12px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        transition: all 120ms ease;
      }
      .iter-dialog-btn-cancel {
        background: var(--surface-1);
        color: var(--text-secondary);
        border: 1px solid var(--border-strong);
      }
      .iter-dialog-btn-cancel:hover {
        background: var(--wash);
      }
    `,
  ];

  @state() private sidebarOpen = true;
  @state() private sessions: SessionItem[] = [];
  @state() private activeSessionId = "";
  @state() private entries: ChatEntry[] = [];
  @state() private loading = false;
  @state() private error = "";
  @state() private runMode = "";
  @state() private approvalModeLabel = "";
  @state() private dangerouslySkipPermissions = false;
  @state() private maxIter = 0;
  @state() private currentIter = 0;
  @state() private hasUndoable = false;
  @state() private hasRedoable = false;
  @state() private thinkingLevel = "";
  @state() private canThink = false;
  @state() private currentModel = "";
  @state() private currentProvider = "";
  @state() private reasoningVis = "";
  @state() private settingsOpen = false;
  @state() private agents: Array<{
    id: string;
    name: string;
    model: string;
    identity?: { emoji?: string };
  }> = [];
  @state() private currentAgentId = "";
  @state() private agentDropdownOpen = false;
  @state() private activeRunId = "";
  @state() private voiceResponsePending = false;
  private audioPlayer: HTMLAudioElement | null = null;
  @state() private usage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  @state() private showOnboarding = false;
  @state() private canvasOpen = false;
  @state() private canvasUrl = "";
  @state() private canvasFrames: string[] = [];
  @state() private swarmOpen = false;
  @state() private panelWidth = 0;
  @state() private showMaxIterDialog = false;
  @state() private showUndoConfirm = false;
  @state() private undoConfirmAction: "last" | "all" = "last";
  @state() private undoableActions: UndoActionSummary[] = [];
  private resizing = false;
  private resizePointerId = -1;

  // ── Lifecycle ──

  connectedCallback() {
    super.connectedCallback();
    if (window.innerWidth <= 768) this.sidebarOpen = false;
    this.loadSessions().then(() => this.restoreFromUrl());
    this.refreshUndoState();
    this.fetchRunConfig();
    this.fetchAgents();
    this.checkOnboarding();
    window.addEventListener("popstate", this.onPopState);
    window.addEventListener("keydown", this.onGlobalKey);
    this.addEventListener("click", this.closeAgentDropdown);
    this.addEventListener(
      "onboarding-complete",
      this.onOnboardingDone as EventListener,
    );
    this.addEventListener(
      "onboarding-close",
      this.onOnboardingDone as EventListener,
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("popstate", this.onPopState);
    window.removeEventListener("keydown", this.onGlobalKey);
    this.removeEventListener("click", this.closeAgentDropdown);
    this.removeEventListener(
      "onboarding-complete",
      this.onOnboardingDone as EventListener,
    );
    this.removeEventListener(
      "onboarding-close",
      this.onOnboardingDone as EventListener,
    );
  }

  private async checkOnboarding() {
    try {
      const res = await fetch("/api/chat/onboarding");
      if (res.ok) {
        const p = await res.json();
        if (!p.completed) this.showOnboarding = true;
      }
    } catch {}
  }

  private onOnboardingDone = () => {
    this.showOnboarding = false;
  };

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

  private onPopState = () => {
    this.restoreFromUrl();
  };

  private restoreFromUrl() {
    const match = window.location.pathname.match(/^\/chat\/(.+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]!);
      if (id && id !== this.activeSessionId) this.selectSession(id);
    }
  }

  private pushChatUrl(id: string) {
    const target = id ? `/chat/${encodeURIComponent(id)}` : "/";
    if (window.location.pathname !== target)
      window.history.pushState(null, "", target);
  }

  // ── API helpers ──

  private async fetchRunConfig() {
    try {
      const res = await fetch("/api/chat/run-config");
      if (res.ok) {
        const data = (await res.json()) as {
          mode: string;
          maxIterations: number;
          approvalMode: string;
          dangerouslySkipPermissions?: boolean;
          thinking?: string;
          reasoningVisibility?: string;
          model?: string;
          provider?: string;
          canThink?: boolean;
        };
        this.runMode = data.mode;
        this.maxIter = data.maxIterations;
        this.approvalModeLabel = data.approvalMode;
        this.dangerouslySkipPermissions =
          data.dangerouslySkipPermissions === true;
        this.thinkingLevel = data.thinking ?? "";
        this.reasoningVis = data.reasoningVisibility ?? "";
        this.currentModel = data.model ?? "";
        this.currentProvider = data.provider ?? "";
        this.canThink = data.canThink ?? false;
      }
    } catch {
      /* ignore */
    }
  }

  private async fetchAgents() {
    try {
      const res = await fetch("/api/chat/agents");
      if (res.ok) {
        const data = (await res.json()) as {
          agents: Array<{
            id: string;
            name: string;
            model: string;
            identity?: { emoji?: string };
          }>;
          defaultId: string | null;
        };
        this.agents = data.agents;
        if (!this.currentAgentId && data.defaultId)
          this.currentAgentId = data.defaultId;
        else if (!this.currentAgentId && data.agents.length > 0)
          this.currentAgentId = data.agents[0]!.id;
      }
    } catch {
      /* ignore */
    }
  }

  private selectAgent(id: string) {
    this.currentAgentId = id;
    this.agentDropdownOpen = false;
  }

  private ensureCanvasPanelWidth() {
    const defaultCanvasWidth = Math.round(
      Math.min(window.innerWidth * 0.42, 560),
    );
    if (!this.panelWidth || this.panelWidth < 320) {
      this.panelWidth = Math.max(320, defaultCanvasWidth);
    }
  }

  private ensureSwarmPanelWidth() {
    const minSwarmWidth = Math.min(520, Math.max(360, window.innerWidth - 220));
    const defaultSwarmWidth = Math.round(
      Math.min(window.innerWidth * 0.62, 860),
    );
    if (!this.panelWidth || this.panelWidth < minSwarmWidth) {
      this.panelWidth = Math.max(minSwarmWidth, defaultSwarmWidth);
    }
  }

  private openCanvasPanelFromAgent() {
    this.swarmOpen = false;
    this.canvasOpen = true;
    this.ensureCanvasPanelWidth();
  }

  private isSwarmToolName(name: string): boolean {
    return name.trim().toLowerCase().startsWith("swarm_");
  }

  private applySwarmFromToolName(name: string) {
    if (!this.isSwarmToolName(name)) return;
    this.canvasOpen = false;
    this.swarmOpen = true;
    this.ensureSwarmPanelWidth();
  }

  private applyCanvasFromToolCall(name: string, args: Record<string, unknown>) {
    if (name !== "canvas") return;
    const action = typeof args.action === "string" ? args.action : "";
    if (action === "present") {
      this.openCanvasPanelFromAgent();
      return;
    }
    if (action === "hide") {
      this.canvasOpen = false;
      return;
    }
    if (action === "navigate") {
      if (typeof args.url === "string" && args.url.trim()) {
        this.canvasUrl = args.url.trim();
      }
      this.openCanvasPanelFromAgent();
      return;
    }
    if (action === "a2ui_reset") {
      this.canvasFrames = [];
      this.openCanvasPanelFromAgent();
      return;
    }
    if (action === "a2ui_push") {
      const jsonl = typeof args.jsonl === "string" ? args.jsonl : "";
      if (jsonl.trim()) {
        const lines = jsonl
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        if (lines.length > 0) {
          this.canvasFrames = [...this.canvasFrames, ...lines];
        }
      }
      this.openCanvasPanelFromAgent();
    }
  }

  private applyCanvasFromToolResult(result: unknown) {
    if (!isRecord(result)) return;

    const canvas = isRecord(result.canvas) ? result.canvas : null;
    if (canvas) {
      if (typeof canvas.visible === "boolean") this.canvasOpen = canvas.visible;
      if (typeof canvas.url === "string" && canvas.url.trim())
        this.canvasUrl = canvas.url.trim();
      if (Array.isArray(canvas.frames)) {
        this.canvasFrames = canvas.frames.filter(
          (line): line is string => typeof line === "string",
        );
      }
    }

    const action =
      typeof result.canvasAction === "string" ? result.canvasAction : "";
    if (action === "hide") this.canvasOpen = false;
    if (action === "a2ui_reset") this.canvasFrames = [];
    if (action === "present" || action === "navigate" || action === "a2ui_push")
      this.openCanvasPanelFromAgent();

    const textResult = typeof result.result === "string" ? result.result : "";
    if (textResult === "Canvas shown") this.openCanvasPanelFromAgent();
    if (textResult === "Canvas hidden") this.canvasOpen = false;
    const navPrefix = "Canvas navigated to ";
    if (textResult.startsWith(navPrefix)) {
      const url = textResult.slice(navPrefix.length).trim();
      if (url) this.canvasUrl = url;
      this.openCanvasPanelFromAgent();
    }
  }

  private toggleCanvas = () => {
    if (!this.canvasOpen) this.swarmOpen = false;
    this.canvasOpen = !this.canvasOpen;
    if (this.canvasOpen) this.ensureCanvasPanelWidth();
  };

  private toggleSwarm = () => {
    if (!this.swarmOpen) this.canvasOpen = false;
    this.swarmOpen = !this.swarmOpen;
    if (this.swarmOpen) this.ensureSwarmPanelWidth();
  };

  private onResizePointerDown = (e: PointerEvent) => {
    e.preventDefault();
    this.resizing = true;
    this.resizePointerId = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    this.requestUpdate();
  };

  private onResizePointerMove = (e: PointerEvent) => {
    if (!this.resizing || e.pointerId !== this.resizePointerId) return;
    const chatContent = this.shadowRoot?.querySelector(
      ".chat-content",
    ) as HTMLElement | null;
    if (!chatContent) return;
    const rect = chatContent.getBoundingClientRect();
    const minWidth = this.swarmOpen
      ? Math.min(520, Math.max(360, rect.width - 220))
      : 320;
    const maxWidth = Math.max(
      minWidth,
      rect.width - (this.swarmOpen ? 140 : 200),
    );
    const newWidth = Math.max(
      minWidth,
      Math.min(maxWidth, rect.right - e.clientX),
    );
    this.panelWidth = Math.round(newWidth);
  };

  private onResizePointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.resizePointerId) return;
    this.resizing = false;
    this.resizePointerId = -1;
    this.requestUpdate();
  };

  private async loadSessions() {
    try {
      const res = await fetch("/api/chat/sessions");
      if (res.ok) this.sessions = (await res.json()) as SessionItem[];
    } catch {}
  }

  private async refreshUndoState() {
    try {
      const result = await api.undo.list();
      this.undoableActions = result.undoable;
      this.hasUndoable = result.undoable.length > 0;
      this.hasRedoable = result.redoable.length > 0;
    } catch {
      const hasToolCalls = this.entries.some(
        (e) => e.kind === "tool_call" || e.kind === "tool_result",
      );
      this.hasUndoable = hasToolCalls;
      this.hasRedoable = hasToolCalls;
    }
  }

  private async newChat() {
    this.activeSessionId = "";
    this.entries = [];
    this.hasUndoable = false;
    this.hasRedoable = false;
    this.error = "";
    this.pushChatUrl("");
  }

  private async selectSession(id: string) {
    if (id === this.activeSessionId) return;
    this.activeSessionId = id;
    this.entries = [];
    this.hasUndoable = false;
    this.hasRedoable = false;
    this.error = "";
    this.pushChatUrl(id);
    try {
      const res = await fetch(`/api/chat/sessions/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: ApiMessage[];
        agentId?: string;
      };
      this.entries = this.apiMessagesToEntries(data.messages);
      // Restore agent context from the session
      if (data.agentId && this.agents.some((a) => a.id === data.agentId)) {
        this.currentAgentId = data.agentId;
      }
      this.refreshUndoState();
    } catch {}
  }

  private async deleteSession(id: string) {
    try {
      await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
      if (this.activeSessionId === id) {
        this.activeSessionId = "";
        this.entries = [];
        this.pushChatUrl("");
      }
      await this.loadSessions();
    } catch {}
  }

  private async batchDeleteSessions(ids: string[]) {
    try {
      await fetch("/api/chat/sessions/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (ids.includes(this.activeSessionId)) {
        this.activeSessionId = "";
        this.entries = [];
        this.pushChatUrl("");
      }
      await this.loadSessions();
    } catch {}
  }

  private async renameSession(detail: { id: string; title: string }) {
    try {
      await fetch(`/api/chat/sessions/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: detail.title }),
      });
      await this.loadSessions();
    } catch {}
  }

  private async resetSession(id: string) {
    try {
      await fetch(`/api/chat/sessions/${id}/reset`, { method: "POST" });
      if (this.activeSessionId === id) {
        this.entries = [];
        this.hasUndoable = false;
        this.hasRedoable = false;
      }
      await this.loadSessions();
      this.refreshUndoState();
    } catch {}
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
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {}
          this.applySwarmFromToolName(tc.function.name);
          this.applyCanvasFromToolCall(tc.function.name, args);
          entries.push({ kind: "tool_call", name: tc.function.name, args });
        }
      } else if (msg.role === "tool" && msg.content) {
        let result: unknown;
        try {
          result = JSON.parse(msg.content);
        } catch {
          result = msg.content;
        }
        this.applyCanvasFromToolResult(result);
        entries.push({ kind: "tool_result", name: "", result });
      }
    }
    return entries;
  }

  // ── Approval & undo ──

  private async handleApproval(detail: {
    id: string;
    approved: boolean;
    allowAlways?: boolean;
  }) {
    try {
      await fetch("/api/chat/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: detail.id,
          approved: detail.approved,
          allowAlways: detail.allowAlways,
        }),
      });
      this.entries = this.entries.map((e) =>
        e.kind === "approval" && e.id === detail.id
          ? { ...e, resolved: true, approved: detail.approved }
          : e,
      );
    } catch (err) {
      this.error = `Approval failed: ${err}`;
    }
  }

  private async handleAbort() {
    try {
      const body: Record<string, string> = {};
      if (this.activeRunId) body.runId = this.activeRunId;
      else if (this.activeSessionId) body.sessionId = this.activeSessionId;
      await fetch("/api/chat/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      /* ignore */
    }
  }

  private async handleUndo(action: string) {
    await this.refreshUndoState();
    if (this.undoableActions.length === 0) {
      this.error = "No actions to undo";
      return;
    }
    this.undoConfirmAction = action === "all" ? "all" : "last";
    this.showUndoConfirm = true;
  }

  private async confirmUndo() {
    this.showUndoConfirm = false;
    try {
      if (this.undoConfirmAction === "all") {
        const result = await api.undo.undoAll();
        const successful = result.results.filter((r) => r.success).length;
        const failed = result.results.filter((r) => !r.success).length;
        this.entries = [
          ...this.entries,
          {
            kind: "assistant",
            content: `Undid ${successful} action(s)${failed > 0 ? `, ${failed} failed` : ""}. Files have been restored to their previous state.`,
          },
        ];
      } else {
        const result = await api.undo.undoLast(1);
        const r = result.results[0];
        if (r?.success) {
          this.entries = [
            ...this.entries,
            {
              kind: "assistant",
              content: `Undid "${r.toolName}" action. File restored to previous state.`,
            },
          ];
        } else {
          this.error = r?.error ?? "Undo failed";
        }
      }
      await this.refreshUndoState();
    } catch (err) {
      this.error = `Undo failed: ${err}`;
    }
  }

  private cancelUndo() {
    this.showUndoConfirm = false;
  }

  private async handleRedo(action: string) {
    try {
      if (action === "all") {
        const result = await api.undo.redoAll();
        const successful = result.results.filter((r) => r.success).length;
        const failed = result.results.filter((r) => !r.success).length;
        if (successful > 0) {
          this.entries = [
            ...this.entries,
            {
              kind: "assistant",
              content: `Redid ${successful} action(s)${failed > 0 ? `, ${failed} failed` : ""}.`,
            },
          ];
        }
      } else {
        const result = await api.undo.redoLast(1);
        const r = result.results[0];
        if (r?.success) {
          this.entries = [
            ...this.entries,
            {
              kind: "assistant",
              content: `Redid "${r.toolName}" action.`,
            },
          ];
        } else if (r) {
          this.error = r.error ?? "Redo failed";
        }
      }
      await this.refreshUndoState();
    } catch (err) {
      this.error = `Redo failed: ${err}`;
    }
  }

  // ── Send + SSE streaming ──

  private async handleSendMessage(detail: {
    text: string;
    attachments?: Array<{
      fileName: string;
      mimeType: string;
      content: string;
    }>;
    voiceInitiated?: boolean;
  }) {
    const { text, attachments, voiceInitiated } = detail;
    if (!text && !attachments?.length) return;
    if (this.loading) return;

    // Track if this message was voice-initiated for auto TTS response
    this.voiceResponsePending = voiceInitiated === true;

    // Session is created by backend if activeSessionId is empty
    const hasFiles = !!attachments?.length;
    const displayText =
      hasFiles && text
        ? text
        : hasFiles
          ? `[${attachments!.length} file${attachments!.length > 1 ? "s" : ""}]`
          : text;
    const images =
      attachments
        ?.filter((a) => a.mimeType.startsWith("image/"))
        .map((a) => `data:${a.mimeType};base64,${a.content}`) ?? [];

    this.error = "";
    this.currentIter = 0;
    this.usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    this.entries = [
      ...this.entries,
      {
        kind: "user",
        content: displayText,
        ...(images.length > 0 ? { images } : {}),
      },
    ];
    this.loading = true;

    const aiEntry: ChatEntry & { kind: "assistant" } = {
      kind: "assistant",
      content: "",
      streaming: true,
    };
    let aiAdded = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId: this.activeSessionId,
          agentId: this.currentAgentId || undefined,
          attachments,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`,
        );
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
              this.entries = [
                ...this.entries,
                { kind: "warning", content: "Generation stopped." },
              ];
              this.activeRunId = "";
            } else if (evt.type === "session_info") {
              // Update sessionId if backend created a new session
              if (evt.sessionId && !this.activeSessionId) {
                this.activeSessionId = evt.sessionId;
                this.pushChatUrl(evt.sessionId);
                this.loadSessions();
              }
              this.runMode = evt.mode ?? "";
              this.approvalModeLabel = evt.approvalMode ?? "";
              this.dangerouslySkipPermissions =
                evt.dangerouslySkipPermissions === true;
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
                this.entries = [
                  ...this.entries.slice(0, -1),
                  {
                    kind: "thinking",
                    content: last.content + (evt.content ?? ""),
                    streaming: !!evt.streaming,
                  },
                ];
              } else {
                this.entries = [
                  ...this.entries,
                  {
                    kind: "thinking",
                    content: evt.content ?? "",
                    streaming: !!evt.streaming,
                  },
                ];
              }
            } else if (evt.type === "token") {
              if (!aiAdded) {
                this.entries = [...this.entries, aiEntry];
                aiAdded = true;
              }
              aiEntry.content += evt.content ?? "";
              this.entries = [...this.entries.slice(0, -1), { ...aiEntry }];
            } else if (evt.type === "tool_call") {
              if (aiAdded && aiEntry.content) {
                aiEntry.streaming = false;
                this.entries = [...this.entries.slice(0, -1), { ...aiEntry }];
                aiAdded = false;
                aiEntry.content = "";
              }
              this.applySwarmFromToolName(evt.name ?? "");
              this.applyCanvasFromToolCall(evt.name ?? "", evt.args ?? {});
              this.entries = [
                ...this.entries,
                {
                  kind: "tool_call",
                  name: evt.name ?? "?",
                  args: evt.args ?? {},
                  iteration: evt.iteration,
                  maxIterations: evt.maxIterations,
                },
              ];
            } else if (evt.type === "tool_result") {
              this.applySwarmFromToolName(evt.name ?? "");
              this.applyCanvasFromToolResult(evt.result);
              this.entries = [
                ...this.entries,
                {
                  kind: "tool_result",
                  name: evt.name ?? "?",
                  result: evt.result,
                },
              ];
              this.hasUndoable = true;
              this.refreshUndoState();
            } else if (evt.type === "approval_pending") {
              this.entries = [
                ...this.entries,
                {
                  kind: "approval",
                  id: evt.id ?? "",
                  tool: evt.tool ?? "?",
                  description: evt.description,
                  args: evt.args,
                },
              ];
            } else if (evt.type === "warning") {
              this.entries = [
                ...this.entries,
                { kind: "warning", content: evt.content ?? "" },
              ];
            } else if (evt.type === "usage" && evt.usage) {
              this.usage = { ...evt.usage };
            } else if (evt.type === "done") {
              if (evt.usage) this.usage = { ...evt.usage };
              if (!aiAdded && evt.content) {
                this.entries = [
                  ...this.entries,
                  { kind: "assistant", content: evt.content },
                ];
              } else if (aiAdded) {
                aiEntry.streaming = false;
                aiEntry.content = evt.content ?? aiEntry.content;
                this.entries = [...this.entries.slice(0, -1), { ...aiEntry }];
              }
              aiAdded = false;
            } else if (evt.type === "error") {
              this.error = evt.content ?? "Unknown error";
            }
          } catch {}
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

      if (this.voiceResponsePending && aiEntry.content) {
        this.playTTS(aiEntry.content);
      }
      this.voiceResponsePending = false;
    }
  }

  private async playTTS(text: string) {
    const cleanText = text.trim();
    if (cleanText.length < 2) return;

    const ttsText =
      cleanText.length > 500 ? cleanText.slice(0, 500) + "..." : cleanText;

    try {
      const res = await fetch("/api/chat/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn(
          "TTS failed:",
          (data as { error?: string }).error ?? res.status,
        );
        return;
      }

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Stop any currently playing audio
      if (this.audioPlayer) {
        this.audioPlayer.pause();
        URL.revokeObjectURL(this.audioPlayer.src);
      }

      this.audioPlayer = new Audio(audioUrl);
      this.audioPlayer.onended = () => {
        if (this.audioPlayer) {
          URL.revokeObjectURL(this.audioPlayer.src);
          this.audioPlayer = null;
        }
      };
      await this.audioPlayer.play();
    } catch (err) {
      console.warn("TTS playback failed:", err);
    }
  }

  // ── Config cycling ──

  private async cycleRunMode() {
    if (this.dangerouslySkipPermissions) {
      this.runMode = "autonomous";
      return;
    }
    const cycle: Record<string, string> = {
      interactive: "supervised",
      supervised: "autonomous",
      autonomous: "interactive",
    };
    const next = cycle[this.runMode || "interactive"] ?? "interactive";
    try {
      const res = await fetch("/api/chat/run-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          mode: string;
          maxIterations: number;
          approvalMode: string;
          dangerouslySkipPermissions?: boolean;
        };
        this.runMode = data.mode;
        this.maxIter = data.maxIterations;
        this.approvalModeLabel = data.approvalMode;
        this.dangerouslySkipPermissions =
          data.dangerouslySkipPermissions === true;
      }
    } catch {}
  }

  private async cycleApprovalMode() {
    if (this.dangerouslySkipPermissions) {
      this.approvalModeLabel = "off";
      return;
    }
    const cycle: Record<string, string> = {
      off: "mutate",
      mutate: "always",
      always: "off",
    };
    const next = cycle[this.approvalModeLabel || "off"] ?? "off";
    try {
      const res = await fetch("/api/chat/approval-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          mode: string;
          dangerouslySkipPermissions?: boolean;
        };
        this.approvalModeLabel = data.mode;
        this.dangerouslySkipPermissions =
          data.dangerouslySkipPermissions === true;
      }
    } catch {}
  }

  private async cycleThinkingLevel() {
    const cycle: Record<string, string> = {
      off: "low",
      low: "medium",
      medium: "high",
      high: "off",
    };
    const next = cycle[this.thinkingLevel || "off"] ?? "off";
    const vis =
      this.reasoningVis === "off" && next !== "off"
        ? "stream"
        : this.reasoningVis;
    try {
      const res = await fetch("/api/chat/thinking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: next, visibility: vis }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          level: string;
          visibility: string;
          canThink: boolean;
        };
        this.thinkingLevel = data.level;
        this.reasoningVis = data.visibility;
        this.canThink = data.canThink;
      }
    } catch {}
  }

  private openMaxIterDialog() {
    this.showMaxIterDialog = true;
  }

  private async selectMaxIter(n: number) {
    this.showMaxIterDialog = false;
    try {
      const res = await fetch("/api/chat/run-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxIterations: n }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          maxIterations: number;
          mode?: string;
          approvalMode?: string;
          dangerouslySkipPermissions?: boolean;
        };
        this.maxIter = data.maxIterations;
        if (data.mode) this.runMode = data.mode;
        if (data.approvalMode) this.approvalModeLabel = data.approvalMode;
        this.dangerouslySkipPermissions =
          data.dangerouslySkipPermissions === true;
      }
    } catch {}
  }

  private fmtTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  private badgeClass(mode: string) {
    const m: Record<string, string> = {
      autonomous: "badge-autonomous",
      supervised: "badge-supervised",
      mutate: "badge-mutate",
      always: "badge-always",
      off: "badge-off",
    };
    return m[mode] ?? "badge-interactive";
  }

  // ── Navigation ──

  private toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  private emitNavigate(view: string) {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: view,
        bubbles: true,
        composed: true,
      }),
    );
  }

  // ── Render ──

  render() {
    return html`
      <div
        class="sidebar-backdrop ${this.sidebarOpen ? "visible" : ""}"
        @click=${this.toggleSidebar}
      ></div>

      <chat-sidebar
        ?collapsed=${!this.sidebarOpen}
        .sessions=${this.sessions}
        .activeSessionId=${this.activeSessionId}
        @new-chat=${() => this.newChat()}
        @select-session=${(e: CustomEvent) => this.selectSession(e.detail)}
        @delete-session=${(e: CustomEvent) => this.deleteSession(e.detail)}
        @batch-delete-sessions=${(e: CustomEvent) =>
          this.batchDeleteSessions(e.detail)}
        @rename-session=${(e: CustomEvent) => this.renameSession(e.detail)}
        @reset-session=${(e: CustomEvent) => this.resetSession(e.detail)}
        @navigate=${(e: CustomEvent) => this.emitNavigate(e.detail)}
        @open-settings=${() => {
          this.settingsOpen = true;
        }}
      ></chat-sidebar>

      <div class="chat-area">
        <div class="chat-header">
          <button
            class="btn-toggle-sidebar"
            @click=${this.toggleSidebar}
            title=${this.sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <svg class="toggle-icon" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
          ${this.agents.length > 0
            ? html`
                <div class="agent-selector">
                  <button
                    class="agent-btn"
                    @click=${() => {
                      this.agentDropdownOpen = !this.agentDropdownOpen;
                    }}
                    title="Switch agent"
                  >
                    ${(() => {
                      const a = this.agents.find(
                        (a) => a.id === this.currentAgentId,
                      );
                      return a
                        ? `${a.identity?.emoji ? a.identity.emoji + " " : ""}${a.name}`
                        : "Agent";
                    })()}
                    <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  ${this.agentDropdownOpen
                    ? html`
                        <div class="agent-dropdown">
                          ${this.agents.map(
                            (a) => html`
                              <div
                                class="agent-option ${a.id ===
                                this.currentAgentId
                                  ? "active"
                                  : ""}"
                                @click=${() => this.selectAgent(a.id)}
                              >
                                <span class="agent-option-name"
                                  >${a.identity?.emoji
                                    ? a.identity.emoji + " "
                                    : ""}${a.name}</span
                                >
                                <span class="agent-option-model"
                                  >${a.model}</span
                                >
                              </div>
                            `,
                          )}
                        </div>
                      `
                    : nothing}
                </div>
              `
            : nothing}
          ${this.currentModel
            ? html`<span
                class="model-label"
                style="cursor:pointer;"
                title=${`${this.currentProvider}/${this.currentModel}. Click to change.`}
                @click=${() => {
                  this.settingsOpen = true;
                }}
                >${this.currentModel}</span
              >`
            : nothing}
          <button
            class="btn-swarm-nav ${this.swarmOpen ? "active" : ""}"
            @click=${this.toggleSwarm}
            title=${this.swarmOpen ? "Hide SWARM" : "Show SWARM"}
          >
            <svg viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="5" r="2" />
              <circle cx="19" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
              <path d="M7 11L10 7M14 7L17 11M7 13L10 17M14 17L17 13" />
            </svg>
            <span>SWARM</span>
          </button>
          <button
            class="btn-canvas ${this.canvasOpen ? "active" : ""}"
            @click=${this.toggleCanvas}
            title=${this.canvasOpen ? "Hide canvas" : "Show canvas"}
          >
            <svg viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>Canvas</span>
          </button>
          <div class="chat-header-spacer"></div>
          <button
            class="btn-header-icon"
            @click=${() => {
              this.showOnboarding = true;
            }}
            title="Profile & Onboarding"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
          ${this.runMode
            ? html`
                <div class="status-info">
                  <span
                    >Mode:
                    <span
                      class="status-badge ${this.badgeClass(this.runMode)}"
                      style=${this.dangerouslySkipPermissions
                        ? "cursor:not-allowed;"
                        : "cursor:pointer;"}
                      title=${this.dangerouslySkipPermissions
                        ? "Locked while --dangerously-skip-permissions is active"
                        : "Click to cycle"}
                      @click=${this.cycleRunMode}
                      >${this.runMode}</span
                    ></span
                  >
                  <span
                    >Approval:
                    <span
                      class="status-badge ${this.badgeClass(
                        this.approvalModeLabel,
                      )}"
                      style=${this.dangerouslySkipPermissions
                        ? "cursor:not-allowed;"
                        : "cursor:pointer;"}
                      title=${this.dangerouslySkipPermissions
                        ? "Locked while --dangerously-skip-permissions is active"
                        : "Click to cycle"}
                      @click=${this.cycleApprovalMode}
                      >${this.approvalModeLabel || "off"}</span
                    ></span
                  >
                  ${this.dangerouslySkipPermissions
                    ? html`<span
                        class="status-badge badge-danger-skip"
                        title="Danger mode: all permission checks are bypassed"
                        >skip-perms</span
                      >`
                    : nothing}
                  ${this.maxIter
                    ? html`<span
                        style="cursor:pointer;"
                        title="Click to change"
                        @click=${() => this.openMaxIterDialog()}
                        >Max:
                        <b
                          >${this.maxIter >= 9999 ? "∞" : this.maxIter}</b
                        ></span
                      >`
                    : nothing}
                  ${this.usage.totalTokens > 0
                    ? html`<span
                        class="usage-label"
                        title="Prompt: ${this.usage
                          .promptTokens} | Completion: ${this.usage
                          .completionTokens}"
                        >${this.fmtTokens(this.usage.totalTokens)} tokens</span
                      >`
                    : nothing}
                </div>
              `
            : nothing}
        </div>

        <div class="chat-content">
          <div class="chat-main">
            ${this.entries.length === 0
              ? html`
                  <div class="empty">
                    <img class="ant-logo" src="/logo.svg" alt="Undoable" />
                    <div class="empty-title">Undoable</div>
                    <div class="empty-sub">
                      Everything the AI does is recorded and can be undone.
                      Start a conversation or pick one from the sidebar.
                    </div>
                  </div>
                `
              : html`
                  <chat-messages
                    .entries=${this.entries}
                    ?loading=${this.loading}
                    .currentIter=${this.currentIter}
                    .maxIter=${this.maxIter}
                    @handle-approval=${(e: CustomEvent) =>
                      this.handleApproval(e.detail)}
                    @chat-error=${(e: CustomEvent) => {
                      this.error = e.detail;
                    }}
                  ></chat-messages>
                `}
            ${this.error
              ? html`<div class="error">${this.error}</div>`
              : nothing}

            <chat-input
              ?loading=${this.loading}
              ?hasUndoable=${this.hasUndoable}
              ?hasRedoable=${this.hasRedoable}
              .thinkingLevel=${this.canThink ? this.thinkingLevel : ""}
              ?canThink=${this.canThink}
              @send-message=${(e: CustomEvent) =>
                this.handleSendMessage(e.detail)}
              @abort-chat=${() => this.handleAbort()}
              @undo=${(e: CustomEvent) => this.handleUndo(e.detail)}
              @redo=${(e: CustomEvent) => this.handleRedo(e.detail)}
              @cycle-thinking=${this.cycleThinkingLevel}
              @chat-error=${(e: CustomEvent) => {
                this.error = e.detail;
              }}
            ></chat-input>
          </div>

          <aside
            class="canvas-shell ${this.canvasOpen ? "open" : ""} ${this.resizing
              ? "resizing"
              : ""}"
            style=${this.canvasOpen ? `width:${this.panelWidth}px` : ""}
          >
            <div
              class="resize-handle ${this.resizing ? "active" : ""}"
              @pointerdown=${this.onResizePointerDown}
              @pointermove=${this.onResizePointerMove}
              @pointerup=${this.onResizePointerUp}
            ></div>
            <div class="canvas-shell-frame">
              <undoable-canvas-panel
                .visible=${this.canvasOpen}
                .url=${this.canvasUrl}
                .frames=${this.canvasFrames}
                @canvas-close=${() => {
                  this.canvasOpen = false;
                }}
              ></undoable-canvas-panel>
            </div>
          </aside>

          <aside
            class="swarm-shell ${this.swarmOpen ? "open" : ""} ${this.resizing
              ? "resizing"
              : ""}"
            style=${this.swarmOpen ? `width:${this.panelWidth}px` : ""}
          >
            <div
              class="resize-handle ${this.resizing ? "active" : ""}"
              @pointerdown=${this.onResizePointerDown}
              @pointermove=${this.onResizePointerMove}
              @pointerup=${this.onResizePointerUp}
            ></div>
            <div class="swarm-shell-frame">
              <swarm-panel
                @swarm-close=${() => {
                  this.swarmOpen = false;
                }}
                @navigate=${(e: CustomEvent) => {
                  this.swarmOpen = false;
                  this.emitNavigate(e.detail);
                }}
              ></swarm-panel>
            </div>
          </aside>
        </div>
      </div>

      <chat-settings
        ?open=${this.settingsOpen}
        .currentModel=${this.currentModel}
        .currentProvider=${this.currentProvider}
        @model-changed=${(e: CustomEvent) => this.handleModelChanged(e.detail)}
        @close-settings=${() => {
          this.settingsOpen = false;
        }}
      ></chat-settings>

      ${this.showOnboarding
        ? html`<undoable-onboarding></undoable-onboarding>`
        : nothing}
      ${this.showMaxIterDialog
        ? html`
            <div
              class="iter-dialog-overlay"
              @click=${() => {
                this.showMaxIterDialog = false;
              }}
            >
              <div
                class="iter-dialog"
                @click=${(e: Event) => e.stopPropagation()}
              >
                <div class="iter-dialog-title">Max Iterations</div>
                <div class="iter-options">
                  ${[10, 25, 50, 100, 200, 500].map(
                    (n) => html`
                      <button
                        class="iter-option ${this.maxIter === n
                          ? "active"
                          : ""}"
                        @click=${() => this.selectMaxIter(n)}
                      >
                        ${n}
                      </button>
                    `,
                  )}
                  <button
                    class="iter-option unlimited ${this.maxIter >= 9999
                      ? "active"
                      : ""}"
                    @click=${() => this.selectMaxIter(9999)}
                  >
                    ∞ Unlimited (always running)
                  </button>
                </div>
                <div class="iter-dialog-actions">
                  <button
                    class="iter-dialog-btn iter-dialog-btn-cancel"
                    @click=${() => {
                      this.showMaxIterDialog = false;
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          `
        : nothing}
      ${this.showUndoConfirm
        ? html`
            <div class="iter-dialog-overlay" @click=${() => this.cancelUndo()}>
              <div
                class="iter-dialog"
                @click=${(e: Event) => e.stopPropagation()}
              >
                <div class="iter-dialog-title">
                  ${this.undoConfirmAction === "all"
                    ? "Undo All Actions?"
                    : "Undo Last Action?"}
                </div>
                <div
                  style="padding: 0 20px 16px; color: var(--text-secondary); font-size: 13px; line-height: 1.5;"
                >
                  ${this.undoConfirmAction === "all"
                    ? html`This will revert
                        <strong>${this.undoableActions.length}</strong> file
                        change(s) to their previous state.`
                    : html`This will revert the last file change:
                        <strong
                          >${this.undoableActions[
                            this.undoableActions.length - 1
                          ]?.tool ?? "unknown"}</strong
                        >`}
                  <div
                    style="margin-top: 12px; max-height: 150px; overflow-y: auto; font-size: 11px; font-family: var(--mono); background: var(--bg-deep); padding: 8px; border-radius: var(--radius-sm);"
                  >
                    ${(this.undoConfirmAction === "all"
                      ? this.undoableActions
                      : this.undoableActions.slice(-1)
                    ).map(
                      (a) => html`
                        <div
                          style="padding: 4px 0; border-bottom: 1px solid var(--border);"
                        >
                          <span style="color: var(--mint);">${a.tool}</span>
                          ${a.args.path
                            ? html`<span style="color: var(--text-tertiary);">
                                → ${a.args.path}</span
                              >`
                            : nothing}
                        </div>
                      `,
                    )}
                  </div>
                </div>
                <div class="iter-dialog-actions" style="gap: 8px;">
                  <button
                    class="iter-dialog-btn iter-dialog-btn-cancel"
                    @click=${() => this.cancelUndo()}
                  >
                    Cancel
                  </button>
                  <button
                    class="iter-dialog-btn"
                    style="background: var(--danger); color: white;"
                    @click=${() => this.confirmUndo()}
                  >
                    ${this.undoConfirmAction === "all" ? "Undo All" : "Undo"}
                  </button>
                </div>
              </div>
            </div>
          `
        : nothing}
    `;
  }

  private handleModelChanged(detail: {
    model: string;
    provider: string;
    name: string;
    capabilities: { thinking: boolean };
  }) {
    this.currentModel = detail.model;
    this.currentProvider = detail.provider;
    this.canThink = detail.capabilities.thinking;
    if (!this.canThink && this.thinkingLevel !== "off") {
      this.thinkingLevel = "off";
    }
    this.settingsOpen = false;
  }
}
