import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  api,
  type ChannelItem,
  type ChannelPairingApproval,
  type ChannelPairingListResult,
  type ChannelPairingRequest,
} from "../api/client.js";

type ChannelId = "telegram" | "discord" | "slack" | "whatsapp";
type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";
const CHANNEL_IDS: ChannelId[] = ["telegram", "discord", "slack", "whatsapp"];

type WizardStep =
  | "select"      // Select channel
  | "token"       // Enter token(s)
  | "dm-policy"   // Configure DM access
  | "allowlist"   // Enter allowlist entries
  | "confirm"     // Review and start
  | "qr";         // WhatsApp QR scan

type WizardState = {
  channel: ChannelId | null;
  step: WizardStep;
  token: string;
  appToken: string;  // Slack only
  tokenConfigured: boolean;
  appTokenConfigured: boolean;
  dmPolicy: DmPolicy;
  allowlist: string[];
  error: string | null;
  loading: boolean;
};

type PlatformInfo = {
  name: string;
  icon: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  tokenHint: string[];
  extraFields?: Array<{ key: string; label: string; placeholder: string; hint: string }>;
  dmPolicyHint: string;
  allowlistHint: string;
  allowlistPlaceholder: string;
  noToken?: boolean;
};

const PLATFORMS: Record<ChannelId, PlatformInfo> = {
  telegram: {
    name: "Telegram",
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
    tokenLabel: "Bot Token",
    tokenPlaceholder: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    tokenHint: [
      "1. Open Telegram and message @BotFather",
      "2. Send /newbot and follow the prompts",
      "3. Copy the token (looks like 123456:ABC...)",
    ],
    dmPolicyHint: "Control who can message your bot directly",
    allowlistHint: "Enter Telegram usernames or user IDs",
    allowlistPlaceholder: "@username or 123456789",
  },
  discord: {
    name: "Discord",
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
    tokenLabel: "Bot Token",
    tokenPlaceholder: "MTIzNDU2Nzg5MDEyMzQ1Njc4.ABcDeF.GhIjKlMnOpQrStUvWxYz",
    tokenHint: [
      "1. Go to discord.com/developers/applications",
      "2. Create New Application → Bot → Add Bot",
      "3. Click Reset Token and copy it",
      "4. Enable Message Content Intent under Privileged Gateway Intents",
      "5. OAuth2 → URL Generator → select 'bot' scope → invite to server",
    ],
    dmPolicyHint: "Control who can DM your bot",
    allowlistHint: "Enter Discord user IDs",
    allowlistPlaceholder: "123456789012345678",
  },
  slack: {
    name: "Slack",
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>`,
    tokenLabel: "Bot Token",
    tokenPlaceholder: "xoxb-1234567890123-1234567890123-AbCdEfGhIjKl",
    tokenHint: [
      "1. Go to api.slack.com/apps → Create New App",
      "2. Enable Socket Mode → generate App-Level Token",
      "3. OAuth & Permissions → add scopes: chat:write, users:read, im:history, channels:history",
      "4. Install to Workspace → copy Bot Token",
    ],
    extraFields: [
      {
        key: "appToken",
        label: "App-Level Token",
        placeholder: "xapp-1-A1234567890-1234567890123-abcdef",
        hint: "Enable Socket Mode to get this token",
      },
    ],
    dmPolicyHint: "Control who can DM your Slack bot",
    allowlistHint: "Enter Slack user IDs",
    allowlistPlaceholder: "U1234567890",
  },
  whatsapp: {
    name: "WhatsApp",
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
    noToken: true,
    tokenLabel: "",
    tokenPlaceholder: "",
    tokenHint: [
      "1. Click 'Start' to begin the pairing process",
      "2. A QR code will appear",
      "3. Open WhatsApp → Settings → Linked Devices → Link a Device",
      "4. Scan the QR code with your phone",
    ],
    dmPolicyHint: "Control who can message you on WhatsApp",
    allowlistHint: "Enter phone numbers in E.164 format",
    allowlistPlaceholder: "+15555550123",
  },
};

const DM_POLICIES: Array<{ value: DmPolicy; label: string; description: string }> = [
  { value: "pairing", label: "Default (Recommended)", description: "Require one-time pairing approval for new direct-message users" },
  { value: "allowlist", label: "Allowlist Only", description: "Only allowed users can message" },
  { value: "open", label: "Open", description: "Anyone can message (use with caution)" },
  { value: "disabled", label: "Disabled", description: "Ignore all direct messages" },
];

function parseDmPolicy(value: unknown): DmPolicy | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "pairing" || normalized === "allowlist" || normalized === "open" || normalized === "disabled") {
    return normalized;
  }
  return undefined;
}

function parseAllowlist(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry).trim())
    .filter(Boolean);
}

function parseChannelId(value: unknown): ChannelId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return CHANNEL_IDS.includes(normalized as ChannelId) ? (normalized as ChannelId) : null;
}

function deriveDmPolicy(channel: ChannelItem): DmPolicy {
  const fromExtra = parseDmPolicy((channel.config.extra as Record<string, unknown> | undefined)?.dmPolicy);
  if (fromExtra) return fromExtra;
  if (channel.config.allowDMs === false) return "disabled";
  if (Array.isArray(channel.config.userAllowlist) && channel.config.userAllowlist.length > 0) return "allowlist";
  return "pairing";
}

function deriveAllowlist(channel: ChannelItem): string[] {
  const fromConfig = parseAllowlist(channel.config.userAllowlist);
  if (fromConfig.length > 0) return fromConfig;
  return parseAllowlist((channel.config.extra as Record<string, unknown> | undefined)?.allowlist);
}

@customElement("channel-list")
export class ChannelList extends LitElement {
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
      --radius-sm: 12px;
      --radius-md: 16px;
      --radius-lg: 28px;
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
    .page-header { margin-bottom: 48px; }
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

    /* Grid layout */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 32px;
    }

    /* Card */
    .card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: box-shadow 200ms ease, border-color 200ms ease;
    }
    .card:hover { border-color: var(--border-strong); }
    .card.connected .platform-icon {
      background: var(--mint-soft);
      color: var(--mint-strong);
    }

    /* Card header */
    .card-header {
      padding: 28px 28px 24px;
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }

    .platform-icon {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-sm);
      background: var(--wash);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ink-soft);
      flex-shrink: 0;
    }
    .platform-icon svg { width: 24px; height: 24px; }

    .platform-info { flex: 1; min-width: 0; }
    .platform-name {
      font-family: var(--font-serif);
      font-size: 22px;
      font-weight: 400;
      color: var(--ink);
      margin-bottom: 4px;
      letter-spacing: -0.01em;
    }
    .platform-account {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--muted);
    }

    .status-badge {
      padding: 6px 14px;
      border-radius: var(--radius-pill);
      font-family: var(--font-sans);
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.02em;
      flex-shrink: 0;
    }
    .status-connected { background: var(--mint-soft); color: var(--mint-strong); }
    .status-connecting { background: var(--wash); color: var(--muted); }
    .status-disconnected { background: var(--wash); color: var(--muted); }
    .status-error { background: var(--danger-soft); color: var(--danger); }

    /* Card body */
    .card-body {
      padding: 0 28px 28px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* Wizard steps */
    .wizard-step { display: flex; flex-direction: column; gap: 16px; }
    .step-header {
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .step-title {
      font-family: var(--font-serif);
      font-size: 18px;
      color: var(--ink);
      margin-bottom: 4px;
    }
    .step-description {
      font-family: var(--font-sans);
      font-size: 14px;
      color: var(--muted);
      line-height: 1.5;
    }

    /* Help box */
    .help-box {
      background: var(--wash);
      border-radius: var(--radius-sm);
      padding: 16px 20px;
    }
    .help-title {
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 10px;
    }
    .help-list {
      margin: 0;
      padding-left: 20px;
      font-family: var(--font-sans);
      font-size: 13px;
      color: var(--ink-soft);
      line-height: 1.7;
    }
    .help-list li { margin-bottom: 4px; }
    .help-list li:last-child { margin-bottom: 0; }
    .help-list li::marker { color: var(--muted); }

    /* Error banner */
    .error-banner {
      padding: 14px 18px;
      background: var(--danger-soft);
      border: 1px solid rgba(192, 57, 43, 0.12);
      border-radius: var(--radius-sm);
      font-family: var(--font-sans);
      font-size: 13px;
      color: var(--danger);
      line-height: 1.5;
    }
    .status-note {
      padding: 14px 18px;
      border-radius: var(--radius-sm);
      font-family: var(--font-sans);
      font-size: 13px;
      line-height: 1.5;
      border: 1px solid var(--border-strong);
      color: var(--ink-soft);
      background: var(--wash);
    }
    .status-note.warn {
      background: rgba(245, 158, 11, 0.08);
      border-color: rgba(245, 158, 11, 0.2);
      color: #b45309;
    }
    .status-note.error {
      background: var(--danger-soft);
      border-color: rgba(192, 57, 43, 0.12);
      color: var(--danger);
    }
    .status-note.info {
      background: rgba(59, 130, 246, 0.08);
      border-color: rgba(59, 130, 246, 0.2);
      color: #1d4ed8;
    }

    /* QR section */
    .qr-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 32px;
      background: var(--wash);
      border-radius: var(--radius-md);
    }
    .qr-image {
      width: 200px;
      height: 200px;
      border-radius: var(--radius-sm);
      background: #fff;
      padding: 12px;
      box-shadow: var(--shadow);
    }
    .qr-label {
      font-family: var(--font-sans);
      font-size: 13px;
      color: var(--muted);
      text-align: center;
      max-width: 260px;
      line-height: 1.5;
    }

    /* Form fields */
    .field-group { display: flex; flex-direction: column; gap: 8px; }
    .field-label {
      font-family: var(--font-sans);
      font-size: 12px;
      font-weight: 500;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .field-hint {
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--muted);
      margin-top: 4px;
    }

    input, textarea {
      padding: 14px 18px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font-mono);
      font-size: 13px;
      outline: none;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    input::placeholder, textarea::placeholder {
      color: var(--muted);
      font-family: var(--font-mono);
      opacity: 0.6;
    }
    input:focus, textarea:focus {
      border-color: var(--mint);
      box-shadow: 0 0 0 3px var(--mint-soft);
    }
    textarea {
      min-height: 80px;
      resize: vertical;
      font-family: var(--font-sans);
    }

    /* Policy options */
    .policy-options { display: flex; flex-direction: column; gap: 8px; }
    .policy-option {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all 150ms ease;
      background: var(--bg);
    }
    .policy-option:hover { border-color: var(--mint); }
    .policy-option.selected {
      border-color: var(--mint);
      background: var(--mint-soft);
    }
    .policy-option input[type="radio"] {
      width: 18px;
      height: 18px;
      margin: 2px 0 0 0;
      accent-color: var(--mint-strong);
    }
    .policy-content { flex: 1; }
    .policy-label {
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 500;
      color: var(--ink);
      margin-bottom: 2px;
    }
    .policy-description {
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--muted);
    }

    /* Card actions */
    .card-actions {
      padding: 20px 28px 28px;
      display: flex;
      gap: 12px;
    }

    button {
      padding: 14px 24px;
      border: none;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 500;
      transition: all 150ms ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 2; fill: none; }

    .btn-primary { background: var(--ink); color: var(--bg); flex: 1; }
    .btn-primary:hover:not(:disabled) { background: var(--ink-soft); }
    .btn-secondary {
      background: var(--wash);
      color: var(--ink-soft);
      border: 1px solid var(--border-strong);
    }
    .btn-secondary:hover:not(:disabled) {
      background: var(--wash-strong);
      color: var(--ink);
    }
    .btn-danger {
      background: var(--danger-soft);
      color: var(--danger);
      border: 1px solid rgba(192, 57, 43, 0.12);
      flex: 1;
    }
    .btn-danger:hover:not(:disabled) { background: rgba(192, 57, 43, 0.12); }

    /* Progress indicator */
    .wizard-progress {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
    }
    .progress-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--wash-strong);
      transition: background 150ms ease;
    }
    .progress-dot.active { background: var(--mint-strong); }
    .progress-dot.completed { background: var(--mint); }

    /* Loading state */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 80px;
      color: var(--muted);
      font-family: var(--font-sans);
      font-size: 14px;
    }

    /* Setup prompt */
    .setup-prompt {
      text-align: center;
      padding: 40px 20px;
    }
    .setup-prompt-text {
      font-family: var(--font-sans);
      font-size: 14px;
      color: var(--muted);
      margin-bottom: 16px;
    }

    /* Pairing management */
    .pairing-section {
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: rgba(230, 240, 236, 0.25);
      padding: 14px;
      display: grid;
      gap: 12px;
    }
    .pairing-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .pairing-title {
      font-family: var(--font-sans);
      font-size: 13px;
      font-weight: 600;
      color: var(--ink);
      margin-bottom: 2px;
    }
    .pairing-subtitle {
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--muted);
      line-height: 1.45;
    }
    .pairing-code-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
    }
    .pairing-group {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 10px;
      background: var(--bg);
      display: grid;
      gap: 8px;
    }
    .pairing-group-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .pairing-empty {
      font-family: var(--font-sans);
      font-size: 12px;
      color: var(--muted);
      line-height: 1.45;
    }
    .pairing-item {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 10px;
      background: var(--wash);
      display: grid;
      gap: 7px;
    }
    .pairing-item-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .pairing-item-id {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--ink-soft);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pairing-item-code,
    .pairing-item-status {
      font-family: var(--font-mono);
      font-size: 11px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--border-strong);
      padding: 2px 8px;
      background: var(--bg);
      color: var(--ink-soft);
      white-space: nowrap;
    }
    .pairing-item-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-family: var(--font-sans);
      font-size: 11px;
      color: var(--muted);
      line-height: 1.45;
    }
    .pairing-item-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .pairing-recent {
      display: grid;
      gap: 6px;
    }
    .pairing-recent-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 8px;
      align-items: center;
      font-family: var(--font-sans);
      font-size: 11px;
      color: var(--muted);
    }
    .pairing-recent-item > span:first-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pairing-recent-status {
      border-radius: var(--radius-pill);
      border: 1px solid var(--border-strong);
      padding: 2px 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
      background: var(--bg);
      color: var(--ink-soft);
    }
    .pairing-recent-status.approved {
      border-color: rgba(34, 197, 94, 0.2);
      color: #15803d;
      background: rgba(34, 197, 94, 0.08);
    }
    .pairing-recent-status.rejected,
    .pairing-recent-status.expired {
      border-color: rgba(192, 57, 43, 0.2);
      color: var(--danger);
      background: rgba(192, 57, 43, 0.08);
    }
    .btn-mini-action {
      padding: 8px 12px;
      min-height: 34px;
      font-size: 12px;
      flex: 0 0 auto;
    }

    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; gap: 24px; }
      .card-header, .card-body, .card-actions { padding-left: 20px; padding-right: 20px; }
      .page-title { font-size: 26px; }
      .pairing-code-row { grid-template-columns: 1fr; }
    }
  `;

  @state() private channels: ChannelItem[] = [];
  @state() private loading = true;
  @state() private pairingData: Record<ChannelId, ChannelPairingListResult> = this.initByChannel((channelId) => ({
    channel: channelId,
    pending: [],
    approved: [],
    recent: [],
  }));
  @state() private pairingLoading: Record<ChannelId, boolean> = this.initByChannel(() => false);
  @state() private pairingError: Record<ChannelId, string | null> = this.initByChannel(() => null);
  @state() private pairingCodeDraft: Record<ChannelId, string> = this.initByChannel(() => "");
  @state() private wizardState: Record<ChannelId, WizardState> = {
    telegram: this.defaultWizardState(),
    discord: this.defaultWizardState(),
    slack: this.defaultWizardState(),
    whatsapp: this.defaultWizardState(),
  };
  private pairingPollTimer?: ReturnType<typeof setInterval>;

  private initByChannel<T>(factory: (channelId: ChannelId) => T): Record<ChannelId, T> {
    return {
      telegram: factory("telegram"),
      discord: factory("discord"),
      slack: factory("slack"),
      whatsapp: factory("whatsapp"),
    };
  }

  private defaultWizardState(): WizardState {
    return {
      channel: null,
      step: "token",
      token: "",
      appToken: "",
      tokenConfigured: false,
      appTokenConfigured: false,
      dmPolicy: "pairing",
      allowlist: [],
      error: null,
      loading: false,
    };
  }

  connectedCallback() {
    super.connectedCallback();
    void this.load();
    this.startLiveRefresh();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.pairingPollTimer) {
      clearInterval(this.pairingPollTimer);
      this.pairingPollTimer = undefined;
    }
  }

  private startLiveRefresh() {
    if (this.pairingPollTimer) clearInterval(this.pairingPollTimer);
    this.pairingPollTimer = setInterval(() => {
      void this.refreshChannelStatuses();
      void this.refreshPairingAll({ silent: true });
    }, 7000);
  }

  private async load() {
    this.loading = true;
    try {
      this.channels = await api.channels.list();
      // Initialize wizard state from existing config
      for (const ch of this.channels) {
        const id = ch.config.channelId as ChannelId;
        this.wizardState[id] = {
          ...this.wizardState[id],
          channel: id,
          tokenConfigured: ch.config.hasToken === true,
          appTokenConfigured: ch.config.hasAppToken === true,
          dmPolicy: deriveDmPolicy(ch),
          allowlist: deriveAllowlist(ch),
        };
      }
      await this.refreshPairingAll({ silent: true });
    } catch {
      this.channels = [];
    }
    this.loading = false;
  }

  private async refreshChannelStatuses() {
    try {
      this.channels = await api.channels.list();
    } catch {
      // best effort only
    }
  }

  private updateWizard(channelId: ChannelId, updates: Partial<WizardState>) {
    this.wizardState = {
      ...this.wizardState,
      [channelId]: { ...this.wizardState[channelId], ...updates },
    };
  }

  private setPairingLoading(channelId: ChannelId, loading: boolean) {
    this.pairingLoading = {
      ...this.pairingLoading,
      [channelId]: loading,
    };
  }

  private setPairingError(channelId: ChannelId, error: string | null) {
    this.pairingError = {
      ...this.pairingError,
      [channelId]: error,
    };
  }

  private setPairingCodeDraft(channelId: ChannelId, value: string) {
    this.pairingCodeDraft = {
      ...this.pairingCodeDraft,
      [channelId]: value.toUpperCase(),
    };
  }

  private applyPairingData(channelId: ChannelId, list: ChannelPairingListResult) {
    const sortedPending = [...list.pending].sort((a, b) => b.updatedAt - a.updatedAt);
    const sortedApproved = [...list.approved].sort((a, b) => b.approvedAt - a.approvedAt);
    const sortedRecent = [...list.recent].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
    this.pairingData = {
      ...this.pairingData,
      [channelId]: {
        channel: channelId,
        pending: sortedPending,
        approved: sortedApproved,
        recent: sortedRecent,
      },
    };
  }

  private async refreshPairing(channelId: ChannelId, opts?: { silent?: boolean }) {
    if (!opts?.silent) this.setPairingLoading(channelId, true);
    try {
      const list = await api.channels.pairingList(channelId);
      const resolvedChannel = parseChannelId(list.channel) ?? channelId;
      this.applyPairingData(resolvedChannel, list);
      this.setPairingError(channelId, null);
    } catch (e) {
      this.setPairingError(channelId, String(e));
    } finally {
      if (!opts?.silent) this.setPairingLoading(channelId, false);
    }
  }

  private async refreshPairingAll(opts?: { silent?: boolean }) {
    if (!opts?.silent) {
      this.pairingLoading = this.initByChannel(() => true);
    }
    await Promise.all(CHANNEL_IDS.map((channelId) => this.refreshPairing(channelId, { silent: true })));
    if (!opts?.silent) {
      this.pairingLoading = this.initByChannel(() => false);
    }
  }

  private async approvePairingByCode(channelId: ChannelId) {
    const code = this.pairingCodeDraft[channelId].trim();
    if (!code) {
      this.setPairingError(channelId, "Enter a pairing code first.");
      return;
    }

    this.setPairingLoading(channelId, true);
    try {
      await api.channels.pairingApprove({
        channel: channelId,
        code,
        approvedBy: "ui",
      });
      this.setPairingCodeDraft(channelId, "");
      this.setPairingError(channelId, null);
      await this.refreshPairing(channelId, { silent: true });
    } catch (e) {
      this.setPairingError(channelId, String(e));
    } finally {
      this.setPairingLoading(channelId, false);
    }
  }

  private async approvePairingRequest(channelId: ChannelId, requestId: string) {
    this.setPairingLoading(channelId, true);
    try {
      await api.channels.pairingApprove({
        requestId,
        approvedBy: "ui",
      });
      this.setPairingError(channelId, null);
      await this.refreshPairing(channelId, { silent: true });
    } catch (e) {
      this.setPairingError(channelId, String(e));
    } finally {
      this.setPairingLoading(channelId, false);
    }
  }

  private async rejectPairingRequest(channelId: ChannelId, requestId: string) {
    this.setPairingLoading(channelId, true);
    try {
      await api.channels.pairingReject({
        requestId,
        rejectedBy: "ui",
      });
      this.setPairingError(channelId, null);
      await this.refreshPairing(channelId, { silent: true });
    } catch (e) {
      this.setPairingError(channelId, String(e));
    } finally {
      this.setPairingLoading(channelId, false);
    }
  }

  private async revokePairingApproval(channelId: ChannelId, userId: string) {
    this.setPairingLoading(channelId, true);
    try {
      await api.channels.pairingRevoke(channelId, userId);
      this.setPairingError(channelId, null);
      await this.refreshPairing(channelId, { silent: true });
    } catch (e) {
      this.setPairingError(channelId, String(e));
    } finally {
      this.setPairingLoading(channelId, false);
    }
  }

  private getStepIndex(step: WizardStep, hasToken: boolean): number {
    if (hasToken) {
      // WhatsApp: qr → dm-policy → allowlist → confirm
      const steps: WizardStep[] = ["qr", "dm-policy", "allowlist", "confirm"];
      return steps.indexOf(step);
    }
    // Others: token → dm-policy → allowlist → confirm
    const steps: WizardStep[] = ["token", "dm-policy", "allowlist", "confirm"];
    return steps.indexOf(step);
  }

  private getTotalSteps(hasToken: boolean): number {
    return hasToken ? 4 : 4;
  }

  private async startChannel(channelId: ChannelId) {
    const state = this.wizardState[channelId];
    this.updateWizard(channelId, { loading: true, error: null });

    try {
      const token = state.token.trim();
      const appToken = state.appToken.trim();
      const extra: Record<string, unknown> = {
        dmPolicy: state.dmPolicy,
        allowlist: state.allowlist,
      };
      if (channelId === "slack" && appToken) {
        extra.appToken = appToken;
      }

      const patch: {
        token?: string;
        extra: Record<string, unknown>;
        allowDMs: boolean;
        allowGroups: boolean;
        userAllowlist: string[];
      } = {
        extra,
        allowDMs: state.dmPolicy !== "disabled",
        allowGroups: true,
        userAllowlist: state.dmPolicy === "allowlist" ? state.allowlist : [],
      };
      if (token) {
        patch.token = token;
      }

      await api.channels.update(channelId, patch);
      await api.channels.start(channelId);
      await this.refreshChannelStatuses();
      await this.refreshPairing(channelId, { silent: true });
    } catch (e) {
      this.updateWizard(channelId, { error: String(e) });
    }

    this.updateWizard(channelId, { loading: false });
  }

  private async stopChannel(channelId: ChannelId) {
    this.updateWizard(channelId, { loading: true });
    try {
      await api.channels.stop(channelId);
      await api.channels.update(channelId, { enabled: false });
      await this.refreshChannelStatuses();
      await this.refreshPairing(channelId, { silent: true });
    } catch { /* error shown in status */ }
    this.updateWizard(channelId, { loading: false });
  }

  private nextStep(channelId: ChannelId) {
    const state = this.wizardState[channelId];
    const platform = PLATFORMS[channelId];

    if (platform.noToken) {
      // WhatsApp flow: qr → dm-policy → allowlist → confirm
      if (state.step === "qr") this.updateWizard(channelId, { step: "dm-policy" });
      else if (state.step === "dm-policy") {
        if (state.dmPolicy === "allowlist") this.updateWizard(channelId, { step: "allowlist" });
        else this.updateWizard(channelId, { step: "confirm" });
      }
      else if (state.step === "allowlist") this.updateWizard(channelId, { step: "confirm" });
    } else {
      // Token-based flow: token → dm-policy → allowlist → confirm
      if (state.step === "token") this.updateWizard(channelId, { step: "dm-policy" });
      else if (state.step === "dm-policy") {
        if (state.dmPolicy === "allowlist") this.updateWizard(channelId, { step: "allowlist" });
        else this.updateWizard(channelId, { step: "confirm" });
      }
      else if (state.step === "allowlist") this.updateWizard(channelId, { step: "confirm" });
    }
  }

  private prevStep(channelId: ChannelId) {
    const state = this.wizardState[channelId];
    const platform = PLATFORMS[channelId];

    if (platform.noToken) {
      if (state.step === "dm-policy") this.updateWizard(channelId, { step: "qr" });
      else if (state.step === "allowlist") this.updateWizard(channelId, { step: "dm-policy" });
      else if (state.step === "confirm") {
        if (state.dmPolicy === "allowlist") this.updateWizard(channelId, { step: "allowlist" });
        else this.updateWizard(channelId, { step: "dm-policy" });
      }
    } else {
      if (state.step === "dm-policy") this.updateWizard(channelId, { step: "token" });
      else if (state.step === "allowlist") this.updateWizard(channelId, { step: "dm-policy" });
      else if (state.step === "confirm") {
        if (state.dmPolicy === "allowlist") this.updateWizard(channelId, { step: "allowlist" });
        else this.updateWizard(channelId, { step: "dm-policy" });
      }
    }
  }

  render() {
    if (this.loading) return html`<div class="loading">Loading channels...</div>`;

    return html`
      <div class="page-header">
        <h1 class="page-title">Channels</h1>
        <p class="page-subtitle">Connect messaging platforms to enable AI-powered conversations</p>
      </div>
      <div class="grid">${this.channels.map((ch) => this.renderCard(ch))}</div>
    `;
  }

  private renderCard(ch: ChannelItem) {
    const id = ch.config.channelId as ChannelId;
    const platform = PLATFORMS[id];
    if (!platform) return nothing;

    const connected = ch.status.connected;
    const hasError = !!ch.status.error;
    const hasQR = !!ch.status.qrDataUrl;
    const state = this.wizardState[id];
    const diagnostic = ch.snapshot?.diagnostics?.[0];
    const diagnosticTone = diagnostic?.severity === "error"
      ? "error"
      : diagnostic?.severity === "warn"
        ? "warn"
        : "info";

    const statusClass = connected ? "status-connected" : hasQR ? "status-connecting" : hasError ? "status-error" : "status-disconnected";
    const statusText = connected ? "Connected" : hasQR ? "Awaiting scan" : hasError ? "Error" : "Offline";

    return html`
      <div class="card ${connected ? "connected" : ""}">
        <div class="card-header">
          <div class="platform-icon">
            <span .innerHTML=${platform.icon}></span>
          </div>
          <div class="platform-info">
            <div class="platform-name">${platform.name}</div>
            ${ch.status.accountName ? html`<div class="platform-account">${ch.status.accountName}</div>` : nothing}
          </div>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>

        <div class="card-body">
          ${ch.status.error ? html`<div class="error-banner">${ch.status.error}</div>` : nothing}
          ${state.error ? html`<div class="error-banner">${state.error}</div>` : nothing}
          ${!ch.status.error && !state.error && diagnostic
            ? html`<div class="status-note ${diagnosticTone}">${diagnostic.message}${diagnostic.recovery ? html`<br /><strong>Recovery:</strong> ${diagnostic.recovery}` : nothing}</div>`
            : nothing}

          ${connected ? this.renderConnectedState(ch, id, platform) : hasQR ? this.renderQRState(ch, id, platform) : this.renderWizard(id, platform, state)}
          ${this.renderPairingSection(id)}
        </div>

        ${this.renderActions(ch, id, platform, state, connected, hasQR)}
      </div>
    `;
  }

  private renderConnectedState(_ch: ChannelItem, _id: ChannelId, platform: PlatformInfo) {
    return html`
      <div class="setup-prompt">
        <div class="setup-prompt-text">
          ${platform.name} is connected and ready to receive messages.
        </div>
      </div>
    `;
  }

  private renderQRState(ch: ChannelItem, _id: ChannelId, _platform: PlatformInfo) {
    return html`
      <div class="qr-section">
        <img class="qr-image" src=${ch.status.qrDataUrl} alt="QR Code" />
        <div class="qr-label">
          Open WhatsApp on your phone → Settings → Linked Devices → Link a Device → Scan this code
        </div>
      </div>
    `;
  }

  private renderWizard(id: ChannelId, platform: PlatformInfo, state: WizardState) {
    const stepIndex = this.getStepIndex(state.step, platform.noToken ?? false);
    const totalSteps = this.getTotalSteps(platform.noToken ?? false);

    return html`
      <div class="wizard-step">
        <div class="wizard-progress">
          ${Array.from({ length: totalSteps }, (_, i) => html`
            <div class="progress-dot ${i < stepIndex ? "completed" : i === stepIndex ? "active" : ""}"></div>
          `)}
        </div>

        ${state.step === "token" ? this.renderTokenStep(id, platform, state) : nothing}
        ${state.step === "qr" ? this.renderQRStep(id, platform, state) : nothing}
        ${state.step === "dm-policy" ? this.renderDmPolicyStep(id, platform, state) : nothing}
        ${state.step === "allowlist" ? this.renderAllowlistStep(id, platform, state) : nothing}
        ${state.step === "confirm" ? this.renderConfirmStep(id, platform, state) : nothing}
      </div>
    `;
  }

  private renderTokenStep(id: ChannelId, platform: PlatformInfo, state: WizardState) {
    return html`
      <div class="step-header">Step 1 of 4</div>
      <div class="step-title">Enter your ${platform.tokenLabel}</div>

      <div class="help-box">
        <div class="help-title">How to get your token</div>
        <ol class="help-list">
          ${platform.tokenHint.map((hint) => html`<li>${hint}</li>`)}
        </ol>
      </div>

      ${(state.tokenConfigured || state.appTokenConfigured) ? html`
        <div class="field-hint">Credentials are already configured. Leave fields empty to keep stored values.</div>
      ` : nothing}

      <div class="field-group">
        <label class="field-label">${platform.tokenLabel}</label>
        <input
          type="password"
          placeholder=${platform.tokenPlaceholder}
          .value=${state.token}
          @input=${(e: InputEvent) => this.updateWizard(id, { token: (e.target as HTMLInputElement).value })}
        />
      </div>

      ${platform.extraFields?.map((field) => html`
        <div class="field-group">
          <label class="field-label">${field.label}</label>
          <input
            type="password"
            placeholder=${field.placeholder}
            .value=${state.appToken}
            @input=${(e: InputEvent) => this.updateWizard(id, { appToken: (e.target as HTMLInputElement).value })}
          />
          <div class="field-hint">${field.hint}</div>
        </div>
      `)}
    `;
  }

  private renderQRStep(_id: ChannelId, platform: PlatformInfo, _state: WizardState) {
    return html`
      <div class="step-header">Step 1 of 4</div>
      <div class="step-title">Link your WhatsApp</div>

      <div class="help-box">
        <div class="help-title">How to connect</div>
        <ol class="help-list">
          ${platform.tokenHint.map((hint: string) => html`<li>${hint}</li>`)}
        </ol>
      </div>

      <div class="setup-prompt">
        <div class="setup-prompt-text">
          Click "Start" below to begin the QR code linking process.
        </div>
      </div>
    `;
  }

  private renderDmPolicyStep(id: ChannelId, platform: PlatformInfo, state: WizardState) {
    return html`
      <div class="step-header">Step 2 of 4</div>
      <div class="step-title">Configure DM Access</div>
      <div class="step-description">${platform.dmPolicyHint}</div>

      <div class="policy-options">
        ${DM_POLICIES.map((policy) => html`
          <label class="policy-option ${state.dmPolicy === policy.value ? "selected" : ""}">
            <input
              type="radio"
              name="dm-policy-${id}"
              .checked=${state.dmPolicy === policy.value}
              @change=${() => this.updateWizard(id, { dmPolicy: policy.value })}
            />
            <div class="policy-content">
              <div class="policy-label">${policy.label}</div>
              <div class="policy-description">${policy.description}</div>
            </div>
          </label>
        `)}
      </div>
    `;
  }

  private renderAllowlistStep(id: ChannelId, platform: PlatformInfo, state: WizardState) {
    return html`
      <div class="step-header">Step 3 of 4</div>
      <div class="step-title">Set Allowlist</div>
      <div class="step-description">${platform.allowlistHint}</div>

      <div class="field-group">
        <label class="field-label">Allowed Users</label>
        <textarea
          placeholder=${platform.allowlistPlaceholder}
          .value=${state.allowlist.join("\n")}
          @input=${(e: InputEvent) => {
            const value = (e.target as HTMLTextAreaElement).value;
            this.updateWizard(id, { allowlist: value.split("\n").map(s => s.trim()).filter(Boolean) });
          }}
        ></textarea>
        <div class="field-hint">Enter one user per line</div>
      </div>
    `;
  }

  private renderConfirmStep(id: ChannelId, platform: PlatformInfo, state: WizardState) {
    return html`
      <div class="step-header">Step ${state.dmPolicy === "allowlist" ? "4" : "3"} of ${state.dmPolicy === "allowlist" ? "4" : "3"}</div>
      <div class="step-title">Review & Connect</div>

      <div class="help-box">
        <div class="help-title">Configuration Summary</div>
        <ul class="help-list" style="list-style: none; padding-left: 0;">
          ${!platform.noToken
            ? html`<li><strong>Token:</strong> ${state.token ? "••••••••" + state.token.slice(-6) : (state.tokenConfigured ? "Configured" : "Not set")}</li>`
            : nothing}
          ${id === "slack"
            ? html`<li><strong>App Token:</strong> ${state.appToken ? "••••••••" + state.appToken.slice(-6) : (state.appTokenConfigured ? "Configured" : "Not set")}</li>`
            : nothing}
          <li><strong>DM Policy:</strong> ${DM_POLICIES.find(p => p.value === state.dmPolicy)?.label}</li>
          ${state.dmPolicy === "allowlist" ? html`<li><strong>Allowlist:</strong> ${state.allowlist.length} user(s)</li>` : nothing}
        </ul>
      </div>
    `;
  }

  private formatTimestamp(value?: number): string {
    if (!value || !Number.isFinite(value)) return "unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "unknown";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  private renderPairingRequestRow(channelId: ChannelId, request: ChannelPairingRequest) {
    const busy = this.pairingLoading[channelId];
    return html`
      <div class="pairing-item">
        <div class="pairing-item-head">
          <span class="pairing-item-id">${request.userId}</span>
          <span class="pairing-item-code">${request.code}</span>
        </div>
        <div class="pairing-item-meta">
          <span>chat ${request.chatId}</span>
          <span>prompted ${request.promptCount}x</span>
          <span>updated ${this.formatTimestamp(request.updatedAt)}</span>
        </div>
        <div class="pairing-item-actions">
          <button class="btn-secondary btn-mini-action" ?disabled=${busy} @click=${() => this.approvePairingRequest(channelId, request.requestId)}>Approve</button>
          <button class="btn-danger btn-mini-action" ?disabled=${busy} @click=${() => this.rejectPairingRequest(channelId, request.requestId)}>Reject</button>
        </div>
      </div>
    `;
  }

  private renderPairingApprovalRow(channelId: ChannelId, approval: ChannelPairingApproval) {
    const busy = this.pairingLoading[channelId];
    return html`
      <div class="pairing-item">
        <div class="pairing-item-head">
          <span class="pairing-item-id">${approval.userId}</span>
          <span class="pairing-item-status">Approved</span>
        </div>
        <div class="pairing-item-meta">
          <span>${this.formatTimestamp(approval.approvedAt)}</span>
          ${approval.approvedBy ? html`<span>by ${approval.approvedBy}</span>` : nothing}
        </div>
        <div class="pairing-item-actions">
          <button class="btn-secondary btn-mini-action" ?disabled=${busy} @click=${() => this.revokePairingApproval(channelId, approval.userId)}>Revoke</button>
        </div>
      </div>
    `;
  }

  private renderPairingRecentRow(request: ChannelPairingRequest) {
    return html`
      <div class="pairing-recent-item">
        <span>${request.userId}</span>
        <span class="pairing-recent-status ${request.status}">${request.status}</span>
        <span>${this.formatTimestamp(request.updatedAt)}</span>
      </div>
    `;
  }

  private renderPairingSection(channelId: ChannelId) {
    const pairing = this.pairingData[channelId];
    const busy = this.pairingLoading[channelId];
    const error = this.pairingError[channelId];
    const code = this.pairingCodeDraft[channelId];

    return html`
      <div class="pairing-section">
        <div class="pairing-header">
          <div>
            <div class="pairing-title">Access approvals</div>
            <div class="pairing-subtitle">Approve users directly from the UI when a bot sends a pairing code.</div>
          </div>
          <button class="btn-secondary btn-mini-action" ?disabled=${busy} @click=${() => this.refreshPairing(channelId)}>
            ${busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        ${error ? html`<div class="error-banner">${error}</div>` : nothing}

        <div class="pairing-code-row">
          <input
            placeholder="Pairing code (example: 5GF7RB)"
            .value=${code}
            @input=${(event: InputEvent) => this.setPairingCodeDraft(channelId, (event.target as HTMLInputElement).value)}
          />
          <button class="btn-primary btn-mini-action" ?disabled=${busy} @click=${() => this.approvePairingByCode(channelId)}>
            Approve Code
          </button>
        </div>

        <div class="pairing-group">
          <div class="pairing-group-head">
            <span>Pending requests</span>
            <span>${pairing.pending.length}</span>
          </div>
          ${pairing.pending.length === 0
            ? html`<div class="pairing-empty">No pending requests.</div>`
            : pairing.pending.map((request) => this.renderPairingRequestRow(channelId, request))}
        </div>

        <div class="pairing-group">
          <div class="pairing-group-head">
            <span>Approved users</span>
            <span>${pairing.approved.length}</span>
          </div>
          ${pairing.approved.length === 0
            ? html`<div class="pairing-empty">No approved users yet.</div>`
            : pairing.approved.slice(0, 8).map((approval) => this.renderPairingApprovalRow(channelId, approval))}
        </div>

        ${pairing.recent.length > 0
          ? html`
            <div class="pairing-group">
              <div class="pairing-group-head">
                <span>Recent decisions</span>
                <span>${pairing.recent.length}</span>
              </div>
              <div class="pairing-recent">
                ${pairing.recent.map((request) => this.renderPairingRecentRow(request))}
              </div>
            </div>
          `
          : nothing}
      </div>
    `;
  }

  private renderActions(_ch: ChannelItem, id: ChannelId, platform: PlatformInfo, state: WizardState, connected: boolean, hasQR: boolean) {
    if (connected) {
      return html`
        <div class="card-actions">
          <button class="btn-secondary" ?disabled=${state.loading} @click=${() => this.refreshChannelStatuses()}>
            Refresh
          </button>
          <button class="btn-danger" ?disabled=${state.loading} @click=${() => this.stopChannel(id)}>
            ${state.loading ? "Stopping..." : "Disconnect"}
          </button>
        </div>
      `;
    }

    if (hasQR) {
      return html`
        <div class="card-actions">
          <button class="btn-secondary" ?disabled=${state.loading} @click=${() => this.refreshChannelStatuses()}>
            Refresh
          </button>
          <button class="btn-secondary" ?disabled=${state.loading} @click=${() => this.stopChannel(id)}>
            Cancel
          </button>
        </div>
      `;
    }

    const hasBotToken = Boolean(state.token.trim() || state.tokenConfigured);
    const hasSlackAppToken = id !== "slack" || Boolean(state.appToken.trim() || state.appTokenConfigured);
    const canProceed = platform.noToken || (hasBotToken && hasSlackAppToken);
    const isLastStep = state.step === "confirm";
    const isFirstStep = state.step === "token" || state.step === "qr";

    return html`
      <div class="card-actions">
        <button class="btn-secondary" ?disabled=${state.loading} @click=${() => this.refreshChannelStatuses()}>
          Refresh
        </button>
        ${!isFirstStep ? html`
          <button class="btn-secondary" @click=${() => this.prevStep(id)}>Back</button>
        ` : nothing}

        ${isLastStep ? html`
          <button class="btn-primary" ?disabled=${state.loading || !canProceed} @click=${() => this.startChannel(id)}>
            ${state.loading ? "Connecting..." : "Connect"}
          </button>
        ` : html`
          <button class="btn-primary" ?disabled=${!canProceed && !platform.noToken} @click=${() => platform.noToken && state.step === "qr" ? this.startChannel(id) : this.nextStep(id)}>
            ${platform.noToken && state.step === "qr" ? "Start" : "Continue"}
          </button>
        `}
      </div>
    `;
  }
}
