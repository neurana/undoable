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

type SkillsWarning = {
  title: string;
  message: string;
  docs: string[];
};

type SearchSkillItem = {
  reference: string;
  repo: string;
  skill: string;
  url: string;
  installCommand: string;
  recommended?: boolean;
};

type SkillsCliResult = {
  ok: boolean;
  command: string;
  message: string;
  warning?: SkillsWarning;
  stdout?: string;
  stderr?: string;
  entries?: string[];
};

type SkillsInstallCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
  detail?: string;
};

type SkillsInstallPreflight = {
  ok: boolean;
  reference: string;
  normalizedReference?: string;
  global: boolean;
  agents: string[];
  checks: SkillsInstallCheck[];
  errors: string[];
  warning?: SkillsWarning;
};

type SkillsInstallResponse = {
  ok: boolean;
  installed: boolean;
  reference: string;
  message: string;
  warning?: SkillsWarning;
  preflight?: SkillsInstallPreflight;
  warnings?: string[];
};

type SkillFilter = "all" | "ready" | "needs-setup" | "disabled";
type ViewMode = "installed" | "discover";
type BannerKind = "info" | "success" | "error";

const SKILL_REFERENCE_REGEX =
  /([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+)/g;
const QUICK_DISCOVERY_TERMS = [
  "testing",
  "deployment",
  "changelog",
  "database",
  "slack",
] as const;

@customElement("skill-list")
export class SkillList extends LitElement {
  static styles = css`
    /* Design tokens */
    :host {
      --bg: #FDFEFD;
      --wash: #E6F0EC;
      --wash-strong: #D4E5DD;
      --ink: #111A17;
      --ink-soft: #2A3B35;
      --muted: #6B7C76;
      --mint: #AEE7C7;
      --mint-soft: rgba(174, 231, 199, 0.25);
      --mint-strong: #7DD3A8;
      --border: rgba(17, 26, 23, 0.08);
      --border-strong: rgba(17, 26, 23, 0.12);
      --danger: #C0392B;
      --danger-soft: rgba(192, 57, 43, 0.08);
      --warning: #B8860B;
      --warning-soft: rgba(184, 134, 11, 0.08);
      --radius-sm: 12px;
      --radius-md: 16px;
      --radius-pill: 999px;
      --shadow: 0 8px 24px rgba(17, 26, 23, 0.06);
      --font-serif: "Instrument Serif", Georgia, serif;
      --font-sans: system-ui, -apple-system, sans-serif;
      --font-mono: ui-monospace, "SF Mono", Menlo, monospace;

      display: block;
      width: 100%;
      box-sizing: border-box;
    }

    /* Page header */
    .page-header { margin-bottom: 32px; }
    .page-title {
      font-family: var(--font-serif);
      font-size: 32px;
      font-weight: 400;
      color: var(--ink);
      margin: 0 0 8px 0;
      letter-spacing: -0.01em;
    }
    .page-subtitle {
      font-family: var(--font-sans);
      font-size: 15px;
      color: var(--muted);
      margin: 0;
      line-height: 1.5;
    }

    /* Stats row */
    .stats-row {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      margin-bottom: 32px;
    }
    .stat {
      display: flex;
      flex-direction: column;
    }
    .stat-value {
      font-family: var(--font-serif);
      font-size: 28px;
      color: var(--ink);
      line-height: 1;
    }
    .stat-label {
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--muted);
      margin-top: 4px;
    }

    /* View tabs */
    .view-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .view-tabs::-webkit-scrollbar {
      display: none;
    }
    .view-tab {
      padding: 12px 20px;
      border: none;
      background: transparent;
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 500;
      color: var(--muted);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      transition: all 150ms ease;
    }
    .view-tab:hover { color: var(--ink-soft); }
    .view-tab.active {
      color: var(--ink);
      border-bottom-color: var(--mint-strong);
    }

    /* Warning banner */
    .warning-banner {
      padding: 16px 20px;
      background: var(--warning-soft);
      border: 1px solid rgba(184, 134, 11, 0.2);
      border-radius: var(--radius-sm);
      margin-bottom: 24px;
    }
    .warning-title {
      font-family: var(--font-sans);
      font-size: 13px;
      font-weight: 600;
      color: var(--warning);
      margin-bottom: 4px;
    }
    .warning-msg {
      font-family: var(--font-sans);
      font-size: 13px;
      color: #7c5a00;
      line-height: 1.5;
    }
    .warning-links {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .warning-links a {
      font-size: 12px;
      color: var(--warning);
      text-decoration: underline;
    }

    /* Discover panel */
    .discover-panel {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: var(--shadow);
    }
    .discover-title {
      font-family: var(--font-serif);
      font-size: 20px;
      color: var(--ink);
      margin: 0 0 4px 0;
    }
    .discover-subtitle {
      font-family: var(--font-sans);
      font-size: 13px;
      color: var(--muted);
      margin: 0 0 20px 0;
      line-height: 1.5;
    }
    .quick-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .quick-label {
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .quick-chip {
      padding: 6px 10px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-pill);
      background: var(--bg);
      color: var(--ink-soft);
      font-size: 12px;
      cursor: pointer;
      transition: all 150ms ease;
    }
    .quick-chip:hover:not(:disabled) {
      background: var(--wash);
      border-color: var(--mint);
    }

    /* Search form */
    .search-form {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }
    .search-input {
      flex: 1;
      padding: 14px 18px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font-sans);
      font-size: 14px;
      outline: none;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    .search-input::placeholder { color: var(--muted); opacity: 0.6; }
    .search-input:focus {
      border-color: var(--mint);
      box-shadow: 0 0 0 3px var(--mint-soft);
    }
    .search-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .search-hint {
      margin-top: -10px;
      margin-bottom: 12px;
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--muted);
    }
    .search-hint code {
      font-family: var(--font-mono);
      background: var(--wash);
      border-radius: 6px;
      padding: 1px 6px;
    }

    /* Buttons */
    button {
      padding: 14px 24px;
      border: none;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 500;
      transition: all 150ms ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-primary { background: var(--ink); color: var(--bg); }
    .btn-primary:hover:not(:disabled) { background: var(--ink-soft); }
    .btn-secondary {
      background: var(--wash);
      color: var(--ink-soft);
      border: 1px solid var(--border-strong);
      padding: 10px 16px;
    }
    .btn-secondary:hover:not(:disabled) {
      background: var(--wash-strong);
      color: var(--ink);
    }
    .btn-small {
      padding: 8px 14px;
      font-size: 13px;
    }
    .btn-danger {
      background: var(--danger-soft);
      color: var(--danger);
      border: 1px solid rgba(192, 57, 43, 0.12);
    }

    /* Target selector */
    .target-selector {
      background: var(--wash);
      border-radius: var(--radius-sm);
      padding: 16px;
      margin-bottom: 20px;
    }
    .target-label {
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 10px;
    }
    .target-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .target-option {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-sans);
      font-size: 13px;
      color: var(--ink-soft);
      cursor: pointer;
    }
    .target-option input {
      accent-color: var(--mint-strong);
      width: 16px;
      height: 16px;
    }
    .target-warning {
      margin-top: 10px;
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--danger);
    }

    /* Search results */
    .search-results {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .search-error {
      font-family: var(--font-sans);
      font-size: 13px;
      color: var(--danger);
      margin-bottom: 12px;
    }
    .result-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: var(--wash);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
    }
    .result-info { flex: 1; min-width: 0; }
    .result-name {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--ink);
      word-break: break-all;
    }
    .result-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
    }
    .result-badge {
      padding: 3px 8px;
      border-radius: var(--radius-pill);
      font-family: var(--font-sans);
      font-size: 10px;
      font-weight: 500;
      background: var(--mint-soft);
      color: var(--mint-strong);
    }
    .result-link {
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--muted);
      text-decoration: underline;
    }
    .install-success {
      font-size: 12px;
      color: #1f7a4c;
      font-weight: 600;
      background: rgba(46, 125, 86, 0.12);
      border: 1px solid rgba(46, 125, 86, 0.2);
      border-radius: var(--radius-pill);
      padding: 6px 10px;
    }
    .status-banner {
      margin-bottom: 14px;
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      font-family: var(--font-sans);
      font-size: 13px;
      line-height: 1.45;
      border: 1px solid transparent;
    }
    .status-banner.info {
      background: var(--wash);
      color: var(--ink-soft);
      border-color: var(--border-strong);
    }
    .status-banner.success {
      background: rgba(46, 125, 86, 0.08);
      color: #1f7a4c;
      border-color: rgba(46, 125, 86, 0.25);
    }
    .status-banner.error {
      background: var(--danger-soft);
      color: var(--danger);
      border-color: rgba(192, 57, 43, 0.2);
    }
    .preflight-panel,
    .scan-warning-panel {
      margin-bottom: 14px;
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-strong);
      background: var(--bg);
    }
    .preflight-title,
    .scan-warning-title {
      font-family: var(--font-sans);
      font-size: 12px;
      font-weight: 600;
      color: var(--ink-soft);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .preflight-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .preflight-item {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 10px;
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--ink-soft);
      background: var(--wash);
    }
    .preflight-item.pass { border-color: rgba(46, 125, 86, 0.3); }
    .preflight-item.warn { border-color: rgba(184, 134, 11, 0.35); }
    .preflight-item.fail { border-color: rgba(192, 57, 43, 0.3); }
    .preflight-label {
      font-weight: 600;
      color: var(--ink);
      margin-right: 8px;
    }
    .preflight-detail {
      margin-top: 4px;
      color: var(--muted);
      font-family: var(--font-mono);
      word-break: break-word;
    }
    .preflight-errors {
      margin: 0 0 10px 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--danger);
    }
    .scan-warning-panel {
      border-color: rgba(184, 134, 11, 0.28);
      background: var(--warning-soft);
    }
    .scan-warning-title {
      color: var(--warning);
    }
    .scan-warning-list {
      margin: 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: var(--font-sans);
      font-size: 12px;
      color: #7c5a00;
    }

    /* Filter bar */
    .filter-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 8px 16px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--border-strong);
      background: transparent;
      color: var(--muted);
      font-size: 13px;
      cursor: pointer;
      transition: all 150ms ease;
    }
    .filter-btn:hover { background: var(--wash); }
    .filter-btn.active {
      background: var(--mint-soft);
      color: var(--mint-strong);
      border-color: var(--mint);
    }

    /* Skill cards */
    .skills-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .skill-card {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 20px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow);
      transition: border-color 200ms ease;
    }
    .skill-card:hover { border-color: var(--border-strong); }
    .skill-card.disabled { opacity: 0.5; }

    .skill-emoji {
      font-size: 28px;
      line-height: 1;
      min-width: 36px;
      text-align: center;
    }
    .skill-content { flex: 1; min-width: 0; }
    .skill-name {
      font-family: var(--font-serif);
      font-size: 18px;
      color: var(--ink);
      margin-bottom: 4px;
    }
    .skill-desc {
      font-family: var(--font-sans);
      font-size: 13px;
      color: var(--muted);
      line-height: 1.5;
      margin-bottom: 8px;
    }
    .skill-badges {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .badge {
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 500;
    }
    .badge-source { background: var(--wash); color: var(--muted); }
    .badge-ready { background: var(--mint-soft); color: var(--mint-strong); }
    .badge-setup { background: var(--warning-soft); color: var(--warning); }
    .badge-disabled { background: var(--danger-soft); color: var(--danger); }

    .skill-missing {
      margin-top: 8px;
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--muted);
    }
    .skill-homepage {
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--ink-soft);
      text-decoration: none;
    }
    .skill-homepage:hover { text-decoration: underline; }

    .skill-actions { flex-shrink: 0; }
    .toggle-btn {
      width: 44px;
      height: 24px;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      position: relative;
      transition: background 200ms ease;
      padding: 0;
    }
    .toggle-btn.on { background: var(--ink); }
    .toggle-btn.off { background: var(--wash-strong); }
    .toggle-btn::after {
      content: "";
      position: absolute;
      top: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: white;
      transition: left 200ms ease;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .toggle-btn.on::after { left: 23px; }
    .toggle-btn.off::after { left: 3px; }

    /* CLI panel */
    .cli-panel {
      background: var(--wash);
      border-radius: var(--radius-sm);
      padding: 16px 20px;
      margin-top: 24px;
    }
    .cli-title {
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 12px;
    }
    .cli-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .entries-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .entry-chip {
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      background: var(--bg);
      border: 1px solid var(--border-strong);
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--ink-soft);
    }
    .cli-result {
      margin-top: 12px;
      padding: 12px;
      background: var(--bg);
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-strong);
    }
    .cli-result.ok { border-color: rgba(46, 125, 86, 0.3); }
    .cli-result.err { border-color: rgba(192, 57, 43, 0.3); }
    .cli-message {
      font-family: var(--font-sans);
      font-size: 13px;
      color: var(--ink-soft);
      margin-bottom: 8px;
    }
    .cli-output {
      margin: 0;
      white-space: pre-wrap;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--muted);
      max-height: 200px;
      overflow: auto;
    }

    /* Load more */
    .load-more-row {
      display: flex;
      justify-content: center;
      margin-top: 20px;
    }

    /* Empty state */
    .empty {
      text-align: center;
      padding: 60px 20px;
    }
    .empty-title {
      font-family: var(--font-serif);
      font-size: 20px;
      color: var(--ink);
      margin-bottom: 8px;
    }
    .empty-text {
      font-family: var(--font-sans);
      font-size: 14px;
      color: var(--muted);
    }

    .loading {
      text-align: center;
      padding: 60px 20px;
      color: var(--muted);
      font-family: var(--font-sans);
      font-size: 14px;
    }

    @media (max-width: 768px) {
      .page-title { font-size: 26px; }
      .stats-row { gap: 14px; }
      .stat-value { font-size: 24px; }
      .discover-panel { padding: 16px; }
      .target-grid { display: grid; grid-template-columns: 1fr; }
      .search-form { flex-direction: column; }
      .search-actions { width: 100%; }
      .search-actions > button { flex: 1; }
      .result-card { flex-direction: column; align-items: flex-start; }
      .result-meta { flex-wrap: wrap; }
      .skill-card { flex-direction: column; gap: 12px; }
      .skill-actions { align-self: flex-end; }
      .view-tab { white-space: nowrap; }
    }
  `;

  @state() private skills: SkillItem[] = [];
  @state() private filter: SkillFilter = "all";
  @state() private viewMode: ViewMode = "discover";
  @state() private loading = true;
  @state() private warning: SkillsWarning | null = null;
  @state() private supportedAgents: string[] = [];
  @state() private selectedAgents = new Set<string>();
  @state() private globalScope = true;
  @state() private query = "";
  @state() private searching = false;
  @state() private searchError = "";
  @state() private searchResults: SearchSkillItem[] = [];
  @state() private installInFlight = new Set<string>();
  @state() private discoverLoaded = false;
  @state() private discoverPage = 0;
  @state() private hasMore = true;
  @state() private loadingMore = false;
  @state() private cliBusy = "";
  @state() private cliResult: SkillsCliResult | null = null;
  @state() private installedEntries: string[] = [];
  @state() private installedRefs = new Set<string>();
  @state() private actionMessage = "";
  @state() private actionMessageKind: BannerKind = "info";
  @state() private preflightChecks: SkillsInstallCheck[] = [];
  @state() private preflightErrors: string[] = [];
  @state() private installWarnings: string[] = [];

  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchRequestId = 0;
  private discoverRequestId = 0;

  connectedCallback() {
    super.connectedCallback();
    void this.initialize();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.searchRequestId++;
    this.discoverRequestId++;
  }

  protected updated(changed: Map<string, unknown>) {
    if (
      (changed.has("viewMode") || changed.has("discoverLoaded")) &&
      this.viewMode === "discover" &&
      !this.discoverLoaded &&
      !this.loadingMore
    ) {
      void this.loadDiscoverSkills(true);
    }
  }

  private async initialize() {
    await this.fetchSkills();
    await this.refreshInstalledEntries(true);
  }

  private async fetchSkills() {
    this.loading = true;
    try {
      const res = await fetch("/api/skills");
      if (res.ok) {
        const data = await res.json() as {
          skills: SkillItem[];
          warning?: SkillsWarning;
          supportedAgents?: string[];
        };
        this.skills = data.skills;
        this.warning = data.warning ?? null;
        this.supportedAgents = Array.isArray(data.supportedAgents) ? data.supportedAgents : [];
        this.ensureDefaultAgentSelection();
      } else {
        this.actionMessage = await this.readApiError(
          res,
          "Failed to load local skills",
        );
        this.actionMessageKind = "error";
      }
    } catch (err) {
      this.actionMessage = this.stringifyError(err);
      this.actionMessageKind = "error";
    }
    this.loading = false;
  }

  private get selectedAgentTargets(): string[] {
    return [...this.selectedAgents];
  }

  private stringifyError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private async readApiError(res: Response, fallback: string): Promise<string> {
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    return payload.error ?? payload.message ?? fallback;
  }

  private setActionMessage(message: string, kind: BannerKind) {
    this.actionMessage = message;
    this.actionMessageKind = kind;
  }

  private resetInstallFeedback() {
    this.preflightChecks = [];
    this.preflightErrors = [];
    this.installWarnings = [];
  }

  private applyPreflightResult(preflight?: SkillsInstallPreflight) {
    if (!preflight) {
      this.preflightChecks = [];
      this.preflightErrors = [];
      return;
    }
    this.preflightChecks = Array.isArray(preflight.checks) ? preflight.checks : [];
    this.preflightErrors = Array.isArray(preflight.errors) ? preflight.errors : [];
  }

  private preflightFailureMessage(preflight?: SkillsInstallPreflight): string {
    if (preflight?.errors && preflight.errors.length > 0) {
      return preflight.errors[0]!;
    }
    const failed = preflight?.checks?.find((check) => check.status === "fail");
    if (failed) return failed.message;
    return "Install preflight checks failed";
  }

  private ensureDefaultAgentSelection() {
    const allowed = new Set(this.supportedAgents);
    const preserved = [...this.selectedAgents].filter((agent) =>
      allowed.has(agent),
    );
    if (preserved.length > 0) {
      if (preserved.length !== this.selectedAgents.size) {
        this.selectedAgents = new Set(preserved);
      }
      return;
    }
    if (this.supportedAgents.length === 0) {
      if (this.selectedAgents.size > 0) this.selectedAgents = new Set();
      return;
    }
    const defaultAgent = this.supportedAgents.includes("codex")
      ? "codex"
      : this.supportedAgents[0]!;
    this.selectedAgents = new Set([defaultAgent]);
  }

  private applyInstalledEntries(entries: string[]) {
    this.installedEntries = entries;
    const refs = new Set<string>();
    for (const entry of entries) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      refs.add(trimmed);
      let match: RegExpExecArray | null;
      SKILL_REFERENCE_REGEX.lastIndex = 0;
      while ((match = SKILL_REFERENCE_REGEX.exec(trimmed)) !== null) {
        refs.add(match[1]!);
      }
    }
    this.installedRefs = refs;
  }

  private toggleAgentTarget(agent: string, checked: boolean) {
    const next = new Set(this.selectedAgents);
    if (checked) next.add(agent);
    else next.delete(agent);
    this.selectedAgents = next;
    void this.refreshInstalledEntries(true);
  }

  private setGlobalScope(checked: boolean) {
    this.globalScope = checked;
    void this.refreshInstalledEntries(true);
  }

  private async refreshInstalledEntries(silent = false) {
    try {
      const res = await fetch("/api/skills/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          global: this.globalScope,
          agents: this.selectedAgentTargets,
        }),
      });
      if (!res.ok) {
        if (!silent) {
          this.setActionMessage(
            await this.readApiError(res, "Failed to list installed skills"),
            "error",
          );
        }
        return;
      }
      const data = (await res.json()) as SkillsCliResult;
      if (Array.isArray(data.entries)) {
        this.applyInstalledEntries(data.entries);
      }
    } catch (err) {
      if (!silent) {
        this.setActionMessage(this.stringifyError(err), "error");
      }
    }
  }

  private scheduleSearch() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.searchDebounceTimer = setTimeout(() => {
      void this.searchSkills();
    }, 260);
  }

  private onQueryInput(value: string) {
    this.query = value;
    this.searchError = "";
    this.scheduleSearch();
  }

  private async clearQuery() {
    this.query = "";
    this.searchError = "";
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    await this.loadDiscoverSkills(true);
  }

  private async loadDiscoverSkills(reset = false) {
    if (reset) {
      this.discoverPage = 0;
      this.searchResults = [];
      this.hasMore = true;
    }
    if (!this.hasMore && !reset) return;

    const requestId = ++this.discoverRequestId;
    this.loadingMore = true;
    this.searchError = "";
    try {
      const res = await fetch("/api/skills/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: this.discoverPage, limit: 10 }),
      });
      if (requestId !== this.discoverRequestId) return;
      if (!res.ok) {
        this.searchError = await this.readApiError(
          res,
          "Failed to load skills",
        );
        return;
      }
      const data = await res.json() as {
        ok: boolean;
        error?: string;
        warning?: SkillsWarning;
        results?: SearchSkillItem[];
        hasMore?: boolean;
      };
      this.warning = data.warning ?? this.warning;
      const newResults = data.results ?? [];
      this.searchResults = reset ? newResults : [...this.searchResults, ...newResults];
      this.hasMore = data.hasMore ?? newResults.length >= 10;
      this.discoverPage++;
      this.discoverLoaded = true;
      if (!data.ok) {
        this.searchError = data.error ?? "Failed to load skills";
      }
    } catch (err) {
      if (requestId !== this.discoverRequestId) return;
      this.searchError = this.stringifyError(err);
    } finally {
      if (requestId === this.discoverRequestId) {
        this.loadingMore = false;
      }
    }
  }

  private async searchSkills() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    if (!this.query.trim()) {
      await this.loadDiscoverSkills(true);
      return;
    }
    const requestId = ++this.searchRequestId;
    this.searching = true;
    this.searchError = "";
    try {
      const res = await fetch("/api/skills/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: this.query }),
      });
      if (requestId !== this.searchRequestId) return;
      if (!res.ok) {
        this.searchError = await this.readApiError(res, "Search failed");
        return;
      }
      const data = await res.json() as {
        ok: boolean;
        error?: string;
        warning?: SkillsWarning;
        results?: SearchSkillItem[];
      };
      this.warning = data.warning ?? this.warning;
      this.searchResults = data.results ?? [];
      this.hasMore = false;
      if (!data.ok) {
        this.searchError = data.error ?? "Search failed";
      }
    } catch (err) {
      if (requestId !== this.searchRequestId) return;
      this.searchError = this.stringifyError(err);
    } finally {
      if (requestId === this.searchRequestId) {
        this.searching = false;
      }
    }
  }

  private async installSkill(reference: string) {
    if (this.installInFlight.has(reference)) return;
    this.resetInstallFeedback();
    if (this.selectedAgentTargets.length === 0) {
      this.setActionMessage(
        "Select at least one target agent before installing.",
        "error",
      );
      return;
    }
    const payload = {
      reference,
      global: this.globalScope,
      agents: this.selectedAgentTargets,
    };
    this.installInFlight = new Set(this.installInFlight).add(reference);
    try {
      const preflightRes = await fetch("/api/skills/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const preflightData = (await preflightRes.json().catch(() => ({}))) as
        | SkillsInstallPreflight
        | { ok?: boolean; message?: string; error?: string };
      if (
        !preflightRes.ok ||
        (typeof preflightData === "object" && preflightData !== null && "ok" in preflightData && preflightData.ok === false)
      ) {
        const parsed = preflightData as SkillsInstallPreflight;
        this.applyPreflightResult(parsed);
        this.setActionMessage(
          this.preflightFailureMessage(parsed),
          "error",
        );
        return;
      }
      this.applyPreflightResult(preflightData as SkillsInstallPreflight);

      const res = await fetch("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as SkillsInstallResponse & {
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        this.applyPreflightResult(data.preflight);
        this.setActionMessage(
          data.message ?? data.error ?? "Install failed",
          "error",
        );
      } else {
        this.searchError = "";
        this.installWarnings = Array.isArray(data.warnings) ? data.warnings : [];
        this.applyPreflightResult(data.preflight);
        this.setActionMessage(
          data.message ?? `Installed ${reference}`,
          "success",
        );
        const nextRefs = new Set(this.installedRefs);
        nextRefs.add(reference);
        this.installedRefs = nextRefs;
        await this.fetchSkills();
        await this.refreshInstalledEntries(true);
      }
    } catch (err) {
      this.setActionMessage(this.stringifyError(err), "error");
    }
    const next = new Set(this.installInFlight);
    next.delete(reference);
    this.installInFlight = next;
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
      const res = await fetch("/api/skills/refresh", { method: "POST" });
      if (!res.ok) {
        this.setActionMessage(
          await this.readApiError(res, "Failed to refresh skills"),
          "error",
        );
        return;
      }
      await this.fetchSkills();
      await this.refreshInstalledEntries(true);
      this.setActionMessage("Local skills reloaded.", "info");
    } catch (err) {
      this.setActionMessage(this.stringifyError(err), "error");
    }
  }

  private async runCli(action: "list" | "check" | "update") {
    this.cliBusy = action;
    try {
      let res: Response;
      if (action === "list") {
        res = await fetch("/api/skills/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ global: this.globalScope, agents: this.selectedAgentTargets }),
        });
      } else if (action === "check") {
        res = await fetch("/api/skills/check", { method: "POST" });
      } else {
        res = await fetch("/api/skills/update", { method: "POST" });
      }
      const payload = await res.json() as SkillsCliResult;
      this.cliResult = payload;
      if (Array.isArray(payload.entries)) {
        this.applyInstalledEntries(payload.entries);
      }
      if (action === "update") {
        await this.fetchSkills();
        await this.refreshInstalledEntries(true);
      }
      if (payload.ok) {
        this.setActionMessage(payload.message || "Skills CLI operation finished.", "info");
      } else {
        this.setActionMessage(payload.message || "Skills CLI operation failed", "error");
      }
    } catch (err) {
      this.cliResult = { ok: false, command: "", message: String(err) };
      this.setActionMessage(this.stringifyError(err), "error");
    }
    this.cliBusy = "";
  }

  private get filtered(): SkillItem[] {
    switch (this.filter) {
      case "ready": return this.skills.filter((s) => s.eligible && !s.disabled);
      case "needs-setup": return this.skills.filter((s) => !s.eligible && !s.disabled);
      case "disabled": return this.skills.filter((s) => s.disabled);
      default: return this.skills;
    }
  }

  private sourceLabel(source: string): string {
    return { bundled: "Bundled", user: "User", workspace: "Workspace" }[source] ?? source;
  }

  render() {
    const ready = this.skills.filter((s) => s.eligible && !s.disabled).length;
    const needsSetup = this.skills.filter((s) => !s.eligible && !s.disabled).length;

    return html`
      <div class="page-header">
        <h1 class="page-title">Skills</h1>
        <p class="page-subtitle">Extend capabilities with installable skill packages</p>
      </div>

      <div class="stats-row">
        <div class="stat">
          <span class="stat-value">${ready}</span>
          <span class="stat-label">Ready</span>
        </div>
        <div class="stat">
          <span class="stat-value">${needsSetup}</span>
          <span class="stat-label">Needs Setup</span>
        </div>
        <div class="stat">
          <span class="stat-value">${this.skills.length}</span>
          <span class="stat-label">Total</span>
        </div>
      </div>

      ${this.warning ? html`
        <div class="warning-banner">
          <div class="warning-title">${this.warning.title}</div>
          <div class="warning-msg">${this.warning.message}</div>
          ${this.warning.docs.length > 0 ? html`
            <div class="warning-links">
              ${this.warning.docs.map((doc) => html`<a href=${doc} target="_blank" rel="noopener">${doc}</a>`)}
            </div>
          ` : nothing}
        </div>
      ` : nothing}

      <div class="view-tabs">
        <button class="view-tab ${this.viewMode === "installed" ? "active" : ""}" @click=${() => this.viewMode = "installed"}>
          Installed Skills
        </button>
        <button class="view-tab ${this.viewMode === "discover" ? "active" : ""}" @click=${() => this.viewMode = "discover"}>
          Discover
        </button>
      </div>

      ${this.viewMode === "discover" ? this.renderDiscover() : this.renderInstalled()}
    `;
  }

  private renderPreflightPanel() {
    if (this.preflightChecks.length === 0 && this.preflightErrors.length === 0) return nothing;
    return html`
      <div class="preflight-panel">
        <div class="preflight-title">Install preflight checks</div>
        ${this.preflightErrors.length > 0 ? html`
          <ul class="preflight-errors">
            ${this.preflightErrors.map((entry) => html`<li>${entry}</li>`)}
          </ul>
        ` : nothing}
        <div class="preflight-grid">
          ${this.preflightChecks.map((check) => html`
            <div class="preflight-item ${check.status}">
              <span class="preflight-label">${check.label}</span>${check.message}
              ${check.detail ? html`<div class="preflight-detail">${check.detail}</div>` : nothing}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  private renderInstallWarnings() {
    if (this.installWarnings.length === 0) return nothing;
    return html`
      <div class="scan-warning-panel">
        <div class="scan-warning-title">Security scan findings</div>
        <ul class="scan-warning-list">
          ${this.installWarnings.map((entry) => html`<li>${entry}</li>`)}
        </ul>
      </div>
    `;
  }

  private renderDiscover() {
    return html`
      <div class="discover-panel">
        <h2 class="discover-title">Find Skills</h2>
        <p class="discover-subtitle">Browse available skills or search the registry</p>
        <div class="quick-row">
          <span class="quick-label">Quick search</span>
          ${QUICK_DISCOVERY_TERMS.map((term) => html`
            <button
              class="quick-chip"
              ?disabled=${this.searching}
              @click=${() => {
                this.query = term;
                void this.searchSkills();
              }}
            >
              ${term}
            </button>
          `)}
        </div>

        <div class="target-selector">
          <div class="target-label">Install Target</div>
          <div class="target-grid">
            ${this.supportedAgents.map((agent) => html`
              <label class="target-option">
                <input type="checkbox" .checked=${this.selectedAgents.has(agent)}
                  @change=${(e: Event) => this.toggleAgentTarget(agent, (e.target as HTMLInputElement).checked)}>
                ${agent}
              </label>
            `)}
            <label class="target-option">
              <input type="checkbox" .checked=${this.globalScope}
                @change=${(e: Event) =>
                  this.setGlobalScope(
                    (e.target as HTMLInputElement).checked,
                  )}>
              Global (-g)
            </label>
          </div>
            ${this.selectedAgentTargets.length === 0 ? html`
            <div class="target-warning">Select at least one target agent to install skills</div>
          ` : nothing}
        </div>

        ${this.actionMessage ? html`
          <div class="status-banner ${this.actionMessageKind}">${this.actionMessage}</div>
        ` : nothing}
        ${this.renderPreflightPanel()}
        ${this.renderInstallWarnings()}

        <div class="search-form">
          <input class="search-input" type="text" placeholder="Search for skills (e.g. testing, deployment, changelog)"
            .value=${this.query}
            @input=${(e: Event) =>
              this.onQueryInput((e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void this.searchSkills();
              }
            }}>
          <div class="search-actions">
            <button class="btn-primary" @click=${() => this.searchSkills()} ?disabled=${this.searching}>
              ${this.searching ? "Searching..." : "Search"}
            </button>
            ${this.query.trim()
              ? html`
                  <button
                    class="btn-secondary"
                    @click=${() => this.clearQuery()}
                    ?disabled=${this.searching}
                  >
                    Clear
                  </button>
                `
              : nothing}
          </div>
        </div>
        <div class="search-hint">Typing auto-searches in ~<code>260ms</code>.</div>

        ${this.searchError ? html`<div class="search-error">${this.searchError}</div>` : nothing}

        ${this.loadingMore && this.searchResults.length === 0 ? html`
          <div class="loading">Loading skills...</div>
        ` : nothing}

        ${this.searchResults.length > 0 ? html`
          <div class="search-results">
            ${this.searchResults.map((row) => html`
              <div class="result-card">
                <div class="result-info">
                  <div class="result-name">${row.reference}</div>
                  <div class="result-meta">
                    ${row.recommended ? html`<span class="result-badge">Recommended</span>` : nothing}
                    <a class="result-link" href=${row.url} target="_blank" rel="noopener">View source</a>
                  </div>
                </div>
                ${this.installedRefs.has(row.reference)
                  ? html`<span class="install-success">Installed</span>`
                  : html`
                      <button
                        class="btn-secondary btn-small"
                        @click=${() => this.installSkill(row.reference)}
                        ?disabled=${this.installInFlight.has(row.reference) || this.selectedAgentTargets.length === 0}
                      >
                        ${this.installInFlight.has(row.reference) ? "Installing..." : "Install"}
                      </button>
                    `}
              </div>
            `)}
          </div>

          ${this.hasMore && !this.query.trim() ? html`
            <div class="load-more-row">
              <button class="btn-secondary" @click=${() => this.loadDiscoverSkills()} ?disabled=${this.loadingMore}>
                ${this.loadingMore ? "Loading..." : "Load More"}
              </button>
            </div>
          ` : nothing}
        ` : nothing}

        ${!this.loadingMore && this.searchResults.length === 0 && this.discoverLoaded ? html`
          <div class="empty">
            <div class="empty-title">No skills found</div>
            <div class="empty-text">${this.query.trim() ? "Try a different search term" : "No skills available in the registry"}</div>
          </div>
        ` : nothing}
      </div>

      ${this.renderCliPanel()}
    `;
  }

  private renderInstalled() {
    return html`
      ${this.actionMessage ? html`
        <div class="status-banner ${this.actionMessageKind}">${this.actionMessage}</div>
      ` : nothing}
      <div class="filter-bar">
        ${(["all", "ready", "needs-setup", "disabled"] as SkillFilter[]).map((f) => html`
          <button class="filter-btn ${this.filter === f ? "active" : ""}" @click=${() => this.filter = f}>
            ${f === "needs-setup" ? "Needs Setup" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        `)}
        <div style="flex:1"></div>
        <button class="btn-secondary btn-small" @click=${this.refreshSkills}>Refresh</button>
      </div>

      ${this.loading ? html`<div class="loading">Loading skills...</div>` : nothing}

      ${!this.loading && this.filtered.length === 0 ? html`
        <div class="empty">
          <div class="empty-title">${this.skills.length === 0 ? "No skills installed" : "No skills match this filter"}</div>
          <div class="empty-text">
            ${this.skills.length === 0
              ? "Go to Discover to find and install skills from the registry"
              : "Try selecting a different filter"}
          </div>
        </div>
      ` : nothing}

      <div class="skills-grid">
        ${this.filtered.map((s) => html`
          <div class="skill-card ${s.disabled ? "disabled" : ""}">
            <span class="skill-emoji">${s.emoji ?? "✨"}</span>
            <div class="skill-content">
              <div class="skill-name">${s.name}</div>
              <div class="skill-desc">${s.description}</div>
              <div class="skill-badges">
                <span class="badge badge-source">${this.sourceLabel(s.source)}</span>
                ${s.disabled ? html`<span class="badge badge-disabled">Disabled</span>`
                  : s.eligible ? html`<span class="badge badge-ready">Ready</span>`
                  : html`<span class="badge badge-setup">Needs Setup</span>`}
                ${s.homepage ? html`<a class="skill-homepage" href=${s.homepage} target="_blank" rel="noopener">Website</a>` : nothing}
              </div>
              ${!s.eligible && !s.disabled && (s.missing.bins.length > 0 || s.missing.env.length > 0) ? html`
                <div class="skill-missing">
                  ${s.missing.bins.length > 0 ? html`Missing: ${s.missing.bins.join(", ")}. ` : nothing}
                  ${s.missing.env.length > 0 ? html`Env: ${s.missing.env.join(", ")}` : nothing}
                </div>
              ` : nothing}
            </div>
            <div class="skill-actions">
              <button class="toggle-btn ${s.disabled ? "off" : "on"}"
                @click=${() => this.toggleSkill(s.name, s.disabled)}
                title=${s.disabled ? "Enable" : "Disable"}></button>
            </div>
          </div>
        `)}
      </div>

      ${this.renderCliPanel()}
    `;
  }

  private renderCliPanel() {
    return html`
      <div class="cli-panel">
        <div class="cli-title">CLI Operations</div>
        <div class="cli-actions">
          <button class="btn-secondary btn-small" @click=${() => this.runCli("list")} ?disabled=${this.cliBusy !== ""}>
            ${this.cliBusy === "list" ? "Listing..." : "List"}
          </button>
          <button class="btn-secondary btn-small" @click=${() => this.runCli("check")} ?disabled=${this.cliBusy !== ""}>
            ${this.cliBusy === "check" ? "Checking..." : "Check"}
          </button>
          <button class="btn-secondary btn-small" @click=${() => this.runCli("update")} ?disabled=${this.cliBusy !== ""}>
            ${this.cliBusy === "update" ? "Updating..." : "Update All"}
          </button>
        </div>

        ${this.installedEntries.length > 0 ? html`
          <div class="entries-list">
            ${this.installedEntries.map((entry) => html`<span class="entry-chip">${entry}</span>`)}
          </div>
        ` : nothing}

        ${this.cliResult ? html`
          <div class="cli-result ${this.cliResult.ok ? "ok" : "err"}">
            <div class="cli-message">${this.cliResult.message}</div>
            ${(this.cliResult.stdout || this.cliResult.stderr) ? html`
              <pre class="cli-output">${this.cliResult.stdout ?? ""}${this.cliResult.stderr ? `\n${this.cliResult.stderr}` : ""}</pre>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }
}
