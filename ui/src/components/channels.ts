import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api, type ChannelItem } from "../api/client.js";

@customElement("channel-list")
export class ChannelList extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; box-sizing: border-box; }

    input {
      padding: 9px 14px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--surface-1);
      color: var(--text-primary);
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
      box-shadow: var(--shadow-sm);
      width: 100%;
      box-sizing: border-box;
    }
    input::placeholder { color: var(--text-tertiary); }
    input:focus { border-color: var(--mint-strong); box-shadow: 0 0 0 3px var(--accent-glow); }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: var(--radius-pill);
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 180ms cubic-bezier(0.2,0.8,0.2,1);
    }
    .btn-primary { background: var(--dark); color: #FDFEFD; }
    .btn-primary:hover { background: var(--accent-hover); box-shadow: 0 4px 12px rgba(46,69,57,0.2); }
    .btn-danger { background: var(--danger-subtle); color: var(--danger); border: 1px solid rgba(192,57,43,0.15); }
    .btn-danger:hover { background: rgba(192,57,43,0.12); }
    .btn-small { padding: 4px 12px; font-size: 11px; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }

    .card {
      background: var(--surface-1);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-lg, 12px);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .channel-name {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .status-badge {
      padding: 3px 10px;
      border-radius: var(--radius-pill);
      font-size: 11px;
      font-weight: 600;
    }
    .status-connected {
      background: var(--accent-subtle);
      color: var(--success);
    }
    .status-disconnected {
      background: var(--wash);
      color: var(--text-tertiary);
    }
    .status-error {
      background: var(--danger-subtle);
      color: var(--danger);
    }

    .account-name {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .error-msg {
      font-size: 12px;
      color: var(--danger);
      padding: 6px 10px;
      background: var(--danger-subtle);
      border-radius: var(--radius-sm);
    }

    .field-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .actions {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .qr-image {
      max-width: 200px;
      border-radius: var(--radius-sm);
    }

    .loading { text-align: center; padding: 40px; color: var(--text-tertiary); font-size: 14px; }

    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
    }
  `;

  @state() private channels: ChannelItem[] = [];
  @state() private loading = true;
  @state() private tokenInputs: Record<string, string> = {};
  @state() private actionLoading: Record<string, boolean> = {};

  private platformNames: Record<string, string> = {
    telegram: "Telegram",
    discord: "Discord",
    slack: "Slack",
    whatsapp: "WhatsApp",
  };

  connectedCallback() {
    super.connectedCallback();
    this.load();
  }

  private async load() {
    this.loading = true;
    try {
      this.channels = await api.channels.list();
    } catch {
      this.channels = [];
    }
    this.loading = false;
  }

  private async saveToken(channelId: string) {
    const token = this.tokenInputs[channelId];
    if (!token) return;
    this.actionLoading = { ...this.actionLoading, [channelId]: true };
    try {
      await api.channels.update(channelId, { token });
      await this.load();
    } catch {
      // Will show via status
    }
    this.actionLoading = { ...this.actionLoading, [channelId]: false };
  }

  private async startChannel(channelId: string) {
    this.actionLoading = { ...this.actionLoading, [channelId]: true };
    try {
      await api.channels.start(channelId);
    } catch {
      // Error will show in status
    }
    await this.load();
    this.actionLoading = { ...this.actionLoading, [channelId]: false };
  }

  private async stopChannel(channelId: string) {
    this.actionLoading = { ...this.actionLoading, [channelId]: true };
    try {
      await api.channels.stop(channelId);
    } catch {
      // Error will show in status
    }
    await this.load();
    this.actionLoading = { ...this.actionLoading, [channelId]: false };
  }

  render() {
    if (this.loading) return html`<div class="loading">Loading channels...</div>`;

    return html`
      <div class="grid">
        ${this.channels.map((ch) => this.renderCard(ch))}
      </div>
    `;
  }

  private renderCard(ch: ChannelItem) {
    const id = ch.config.channelId;
    const name = this.platformNames[id] ?? id;
    const connected = ch.status.connected;
    const hasError = !!ch.status.error;
    const isLoading = this.actionLoading[id] ?? false;

    const statusClass = connected ? "status-connected" : hasError ? "status-error" : "status-disconnected";
    const statusText = connected ? "Connected" : hasError ? "Error" : "Disconnected";

    return html`
      <div class="card">
        <div class="card-header">
          <span class="channel-name">${name}</span>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>

        ${ch.status.accountName ? html`<div class="account-name">@${ch.status.accountName}</div>` : nothing}
        ${ch.status.error ? html`<div class="error-msg">${ch.status.error}</div>` : nothing}

        ${ch.status.qrDataUrl ? html`<img class="qr-image" src=${ch.status.qrDataUrl} alt="QR Code" />` : nothing}

        <div>
          <div class="field-label">Token</div>
          <input
            type="password"
            placeholder="${name} bot token"
            .value=${this.tokenInputs[id] ?? ch.config.token ?? ""}
            @input=${(e: InputEvent) => {
              this.tokenInputs = { ...this.tokenInputs, [id]: (e.target as HTMLInputElement).value };
            }}
          />
        </div>

        <div class="actions">
          ${!connected ? html`
            <button class="btn-primary btn-small" ?disabled=${isLoading}
              @click=${async () => {
                if (this.tokenInputs[id]) await this.saveToken(id);
                await this.startChannel(id);
              }}>
              ${isLoading ? "Starting..." : "Start"}
            </button>
          ` : html`
            <button class="btn-danger btn-small" ?disabled=${isLoading}
              @click=${() => this.stopChannel(id)}>
              ${isLoading ? "Stopping..." : "Stop"}
            </button>
          `}
          ${!connected && this.tokenInputs[id] ? html`
            <button class="btn-small" style="background:var(--wash);color:var(--text-secondary);border:1px solid var(--border-strong)"
              ?disabled=${isLoading}
              @click=${() => this.saveToken(id)}>
              Save Token
            </button>
          ` : nothing}
        </div>
      </div>
    `;
  }
}
