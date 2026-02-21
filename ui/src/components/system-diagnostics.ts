import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  api,
  type ChannelCapabilitiesResult,
  type ChannelItem,
  type ChannelLogsResult,
  type ChannelPairingListResult,
  type ChannelProbeSummaryResult,
  type DaemonOperationMode,
  type DaemonOperationalState,
  type HealthStatusResponse,
  type PermissionStatusResponse,
} from "../api/client.js";

type Settled<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type SecuritySummary = {
  totalChannels: number;
  configuredChannels: number;
  connectedChannels: number;
  riskyChannels: number;
  warnFindings: number;
  errorFindings: number;
  openPolicies: number;
  emptyAllowlists: number;
};

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) return err.message;
  return "Unknown error";
}

async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true as const, value: await promise };
  } catch (err) {
    return { ok: false as const, error: toErrorMessage(err) };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

@customElement("system-diagnostics")
export class SystemDiagnostics extends LitElement {
  static styles = css`
    :host {
      display: block;
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 14px;
      background: var(--surface-1, #fff);
      box-shadow: var(--shadow-soft, 0 2px 8px rgba(17, 26, 23, 0.04));
      padding: 16px;
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .title {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-primary, #1a1a1a);
      letter-spacing: -0.01em;
    }

    .sub {
      font-size: 12px;
      color: var(--text-secondary, #5f6763);
      margin-top: 2px;
    }

    .actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .stamp {
      font-size: 11px;
      color: var(--text-tertiary, #86908a);
    }

    .btn {
      padding: 7px 12px;
      border-radius: 8px;
      border: 1px solid var(--border-strong, #c8d2ce);
      background: var(--surface-1, #fff);
      color: var(--text-primary, #1a1a1a);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      line-height: 1.2;
    }

    .btn:hover {
      background: var(--wash, #eef3f1);
    }

    .btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .card {
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 10px;
      background: color-mix(in srgb, var(--surface-1, #fff) 88%, var(--bg-deep, #f6faf8));
      padding: 12px;
      min-height: 130px;
    }

    .card-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.45px;
      color: var(--text-tertiary, #88928d);
      font-weight: 700;
      margin-bottom: 8px;
    }

    .status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }

    .status-label {
      font-size: 12px;
      color: var(--text-secondary, #5a645f);
    }

    .status-value {
      font-size: 12px;
      color: var(--text-primary, #1a1a1a);
      font-weight: 600;
      text-align: right;
    }

    .pill {
      font-size: 10px;
      padding: 3px 7px;
      border-radius: 999px;
      border: 1px solid transparent;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      line-height: 1.2;
      white-space: nowrap;
    }

    .pill.ok {
      color: var(--success, #2e7d56);
      border-color: color-mix(in srgb, var(--success, #2e7d56) 28%, transparent);
      background: color-mix(in srgb, var(--success, #2e7d56) 12%, #fff);
    }

    .pill.warn {
      color: var(--warning, #b8860b);
      border-color: color-mix(in srgb, var(--warning, #b8860b) 35%, transparent);
      background: color-mix(in srgb, var(--warning, #b8860b) 14%, #fff);
    }

    .pill.error {
      color: var(--danger, #c0392b);
      border-color: color-mix(in srgb, var(--danger, #c0392b) 35%, transparent);
      background: color-mix(in srgb, var(--danger, #c0392b) 12%, #fff);
    }

    .hint {
      font-size: 11px;
      color: var(--text-secondary, #65706b);
      margin-top: 8px;
      line-height: 1.45;
    }

    .mode-controls {
      display: grid;
      gap: 8px;
      margin-top: 8px;
    }

    .input,
    .select {
      width: 100%;
      min-height: 34px;
      border-radius: 8px;
      border: 1px solid var(--border-strong, #cfd9d4);
      background: var(--surface-1, #fff);
      color: var(--text-primary, #1a1a1a);
      font-size: 12px;
      font-family: inherit;
      padding: 7px 10px;
    }

    .input:focus,
    .select:focus {
      outline: none;
      border-color: var(--accent, #2e4539);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #2e4539) 18%, transparent);
    }

    .row-inline {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .flex-1 {
      flex: 1;
      min-width: 0;
    }

    .message {
      margin-top: 10px;
      font-size: 11px;
      border-radius: 8px;
      padding: 8px 10px;
      line-height: 1.45;
    }

    .message.warn {
      color: var(--warning, #b8860b);
      background: color-mix(in srgb, var(--warning, #b8860b) 12%, #fff);
      border: 1px solid color-mix(in srgb, var(--warning, #b8860b) 25%, transparent);
    }

    .message.error {
      color: var(--danger, #c0392b);
      background: color-mix(in srgb, var(--danger, #c0392b) 11%, #fff);
      border: 1px solid color-mix(in srgb, var(--danger, #c0392b) 24%, transparent);
    }

    .list {
      display: grid;
      gap: 6px;
      margin-top: 6px;
    }

    .log {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      border: 1px solid var(--border-divider, #e0e0e0);
      border-radius: 8px;
      padding: 7px 8px;
      background: var(--surface-1, #fff);
    }

    .log-main {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    .log-title {
      font-size: 11px;
      color: var(--text-primary, #1a1a1a);
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .log-meta {
      font-size: 10px;
      color: var(--text-tertiary, #8f9792);
    }

    .log-time {
      font-size: 10px;
      color: var(--text-tertiary, #8f9792);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .log-level {
      margin-right: 6px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.35px;
    }

    .log-level.warn {
      color: var(--warning, #b8860b);
    }

    .log-level.error {
      color: var(--danger, #c0392b);
    }

    .mono {
      font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    }

    @media (max-width: 920px) {
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `;

  @state() private loading = false;
  @state() private savingOperation = false;
  @state() private updatedAt = 0;
  @state() private warnings: string[] = [];
  @state() private error = "";
  @state() private operationError = "";

  @state() private health: HealthStatusResponse | null = null;
  @state() private permissions: PermissionStatusResponse | null = null;
  @state() private operation: DaemonOperationalState | null = null;
  @state() private channels: ChannelItem[] = [];
  @state() private probes: ChannelProbeSummaryResult | null = null;
  @state() private capabilities: ChannelCapabilitiesResult | null = null;
  @state() private logs: ChannelLogsResult | null = null;
  @state() private pairing: ChannelPairingListResult | null = null;

  @state() private operationModeDraft: DaemonOperationMode = "normal";
  @state() private operationReasonDraft = "";

  connectedCallback(): void {
    super.connectedCallback();
    void this.refresh();
  }

  private deriveHealthOperation(): DaemonOperationalState | null {
    const checks = asRecord(this.health?.checks);
    const operation = asRecord(checks?.operation);
    if (!operation) return null;

    const modeRaw = asString(operation.mode);
    if (modeRaw !== "normal" && modeRaw !== "drain" && modeRaw !== "paused") {
      return null;
    }

    return {
      mode: modeRaw,
      reason: asString(operation.reason) ?? "",
      updatedAt: asString(operation.updatedAt) ?? "",
    };
  }

  private computeSecuritySummary(): SecuritySummary {
    let configuredChannels = 0;
    let connectedChannels = 0;
    let riskyChannels = 0;
    let warnFindings = 0;
    let errorFindings = 0;
    let openPolicies = 0;
    let emptyAllowlists = 0;

    for (const channel of this.channels) {
      const snapshot = channel.snapshot;
      if (!snapshot) continue;

      let channelRisk = false;

      if (snapshot.configured) configuredChannels += 1;
      if (snapshot.connected) connectedChannels += 1;

      for (const diagnostic of snapshot.diagnostics ?? []) {
        if (diagnostic.severity === "error") {
          errorFindings += 1;
          channelRisk = true;
        } else if (diagnostic.severity === "warn") {
          warnFindings += 1;
          channelRisk = true;
        }
      }

      if (snapshot.dmPolicy === "open") {
        openPolicies += 1;
        warnFindings += 1;
        channelRisk = true;
      }

      if (snapshot.dmPolicy === "allowlist" && snapshot.allowlistCount === 0) {
        emptyAllowlists += 1;
        errorFindings += 1;
        channelRisk = true;
      }

      if (snapshot.enabled && snapshot.configured && !snapshot.connected && snapshot.status === "offline") {
        warnFindings += 1;
        channelRisk = true;
      }

      if (channelRisk) riskyChannels += 1;
    }

    return {
      totalChannels: this.channels.length,
      configuredChannels,
      connectedChannels,
      riskyChannels,
      warnFindings,
      errorFindings,
      openPolicies,
      emptyAllowlists,
    };
  }

  private formatTimestamp(ts: number): string {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return "-";
    }
  }

  private modePillClass(mode: DaemonOperationMode): "ok" | "warn" | "error" {
    if (mode === "normal") return "ok";
    if (mode === "drain") return "warn";
    return "error";
  }

  private async refresh(): Promise<void> {
    this.loading = true;
    this.error = "";
    this.warnings = [];

    const [
      healthResult,
      operationResult,
      permissionsResult,
      channelsResult,
      probeResult,
      capabilitiesResult,
      logsResult,
      pairingResult,
    ] = await Promise.all([
      settle(api.health.status()),
      settle(api.settings.operation.get()),
      settle(api.health.permissions()),
      settle(api.channels.list()),
      settle(api.channels.probe(undefined, true)),
      settle(api.channels.capabilities()),
      settle(api.channels.logs({ limit: 120 })),
      settle(api.channels.pairingList()),
    ]);

    const warnings: string[] = [];

    if ("value" in healthResult) {
      this.health = healthResult.value;
    } else {
      this.health = null;
      this.error = `Health endpoint unavailable: ${healthResult.error}`;
    }

    if ("value" in operationResult) {
      this.operation = operationResult.value;
    } else {
      this.operation = this.deriveHealthOperation();
      warnings.push(`Operation mode endpoint unavailable: ${operationResult.error}`);
    }

    if ("value" in permissionsResult) {
      this.permissions = permissionsResult.value;
    } else {
      this.permissions = null;
      warnings.push(`Permission check unavailable: ${permissionsResult.error}`);
    }

    if ("value" in channelsResult) {
      this.channels = channelsResult.value;
    } else {
      this.channels = [];
      warnings.push(`Channel status unavailable: ${channelsResult.error}`);
    }

    if ("value" in probeResult) {
      this.probes = probeResult.value;
    } else {
      this.probes = null;
      warnings.push(`Channel probe unavailable: ${probeResult.error}`);
    }

    if ("value" in capabilitiesResult) {
      this.capabilities = capabilitiesResult.value;
    } else {
      this.capabilities = null;
      warnings.push(`Channel capabilities unavailable: ${capabilitiesResult.error}`);
    }

    if ("value" in logsResult) {
      this.logs = logsResult.value;
    } else {
      this.logs = null;
      warnings.push(`Channel logs unavailable: ${logsResult.error}`);
    }

    if ("value" in pairingResult) {
      this.pairing = pairingResult.value;
    } else {
      this.pairing = null;
      warnings.push(`Pairing summary unavailable: ${pairingResult.error}`);
    }

    const activeOperation = this.operation ?? this.deriveHealthOperation();
    if (activeOperation) {
      this.operationModeDraft = activeOperation.mode;
      this.operationReasonDraft = activeOperation.reason;
    }

    this.warnings = warnings;
    this.updatedAt = Date.now();
    this.loading = false;
  }

  private async saveOperationMode(): Promise<void> {
    this.savingOperation = true;
    this.operationError = "";
    try {
      const next = await api.settings.operation.update(
        this.operationModeDraft,
        this.operationReasonDraft.trim(),
      );
      this.operation = next;
      await this.refresh();
    } catch (err) {
      this.operationError = toErrorMessage(err);
    } finally {
      this.savingOperation = false;
    }
  }

  render() {
    const healthChecks = asRecord(this.health?.checks);
    const databaseCheck = asRecord(healthChecks?.database);
    const schedulerCheck = asRecord(healthChecks?.scheduler);
    const channelCheck = asRecord(healthChecks?.channels);

    const operation = this.operation ?? this.deriveHealthOperation();
    const summary = this.computeSecuritySummary();

    const schedulerStarted = asBoolean(schedulerCheck?.started);
    const schedulerJobs = asNumber(schedulerCheck?.jobCount);
    const dbInitialized = asBoolean(databaseCheck?.initialized);
    const acceptingRuns = asBoolean(healthChecks?.acceptingNewRuns);
    const fullDiskAccess = this.permissions?.fullDiskAccess;
    const pendingPairing = this.pairing?.pending.length ?? 0;
    const approvedPairing = this.pairing?.approved.length ?? 0;

    const connectedFromHealth = asNumber(channelCheck?.connected);
    const totalFromHealth = asNumber(channelCheck?.total);

    const latestEvents = (this.logs?.logs ?? [])
      .filter((row) => row.level !== "info")
      .slice(-8)
      .reverse();

    return html`
      <div class="head">
        <div>
          <div class="title">System Coverage</div>
          <div class="sub">Health, operation state, channel risk, and runtime diagnostics.</div>
        </div>
        <div class="actions">
          ${this.updatedAt > 0
            ? html`<span class="stamp">Updated ${this.formatTimestamp(this.updatedAt)}</span>`
            : nothing}
          <button class="btn" ?disabled=${this.loading} @click=${() => this.refresh()}>
            ${this.loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <div class="card-title">Daemon Health</div>
          <div class="status-row">
            <span class="status-label">Readiness</span>
            <span class="pill ${this.health?.ready ? "ok" : "error"}">
              ${this.health?.ready ? "ready" : "degraded"}
            </span>
          </div>
          <div class="status-row">
            <span class="status-label">Version</span>
            <span class="status-value mono">${this.health?.version ?? "-"}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Scheduler</span>
            <span class="status-value">
              ${schedulerStarted === null
                ? "-"
                : schedulerStarted
                  ? `running${schedulerJobs !== null ? ` · ${schedulerJobs} jobs` : ""}`
                  : "stopped"}
            </span>
          </div>
          <div class="status-row">
            <span class="status-label">Database</span>
            <span class="status-value">
              ${dbInitialized === null ? "-" : dbInitialized ? "initialized" : "not ready"}
            </span>
          </div>
          <div class="status-row">
            <span class="status-label">Accepting runs</span>
            <span class="status-value">
              ${acceptingRuns === null ? "-" : acceptingRuns ? "yes" : "no"}
            </span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Operation Mode</div>
          <div class="status-row">
            <span class="status-label">Current mode</span>
            <span class="pill ${operation ? this.modePillClass(operation.mode) : "warn"}">
              ${operation?.mode ?? "unknown"}
            </span>
          </div>
          <div class="status-row">
            <span class="status-label">Reason</span>
            <span class="status-value">${operation?.reason?.trim() ? operation.reason : "-"}</span>
          </div>
          <div class="mode-controls">
            <select
              class="select"
              .value=${this.operationModeDraft}
              ?disabled=${this.savingOperation}
              @change=${(event: Event) => {
                const value = (event.target as HTMLSelectElement).value;
                if (value === "normal" || value === "drain" || value === "paused") {
                  this.operationModeDraft = value;
                }
              }}
            >
              <option value="normal">normal</option>
              <option value="drain">drain</option>
              <option value="paused">paused</option>
            </select>
            <div class="row-inline">
              <input
                class="input flex-1"
                .value=${this.operationReasonDraft}
                maxlength="280"
                placeholder="Reason (optional)"
                ?disabled=${this.savingOperation}
                @input=${(event: Event) => {
                  this.operationReasonDraft = (event.target as HTMLInputElement).value;
                }}
              />
              <button class="btn" ?disabled=${this.savingOperation} @click=${() => this.saveOperationMode()}>
                ${this.savingOperation ? "Saving..." : "Apply"}
              </button>
            </div>
          </div>
          ${this.operationError
            ? html`<div class="message error">Failed to update operation mode: ${this.operationError}</div>`
            : nothing}
        </div>

        <div class="card">
          <div class="card-title">Channel Security</div>
          <div class="status-row">
            <span class="status-label">Connected / total</span>
            <span class="status-value">
              ${(connectedFromHealth ?? summary.connectedChannels).toString()} / ${(totalFromHealth ?? summary.totalChannels).toString()}
            </span>
          </div>
          <div class="status-row">
            <span class="status-label">Configured channels</span>
            <span class="status-value">${summary.configuredChannels}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Risky channels</span>
            <span class="status-value">${summary.riskyChannels}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Warnings / errors</span>
            <span class="status-value">${summary.warnFindings} / ${summary.errorFindings}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Open DM policies</span>
            <span class="status-value">${summary.openPolicies}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Empty allowlists</span>
            <span class="status-value">${summary.emptyAllowlists}</span>
          </div>
          <div class="status-row">
            <span class="status-label">Pending pairings</span>
            <span class="status-value">${pendingPairing} pending · ${approvedPairing} approved</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Runtime Safety</div>
          <div class="status-row">
            <span class="status-label">Full Disk Access</span>
            <span class="pill ${fullDiskAccess === true ? "ok" : "warn"}">
              ${fullDiskAccess === true ? "granted" : "check"}
            </span>
          </div>
          <div class="status-row">
            <span class="status-label">Channel probes</span>
            <span class="status-value">
              ${this.probes ? `${this.probes.okCount} ok / ${this.probes.failCount} fail` : "-"}
            </span>
          </div>
          <div class="status-row">
            <span class="status-label">Capabilities loaded</span>
            <span class="status-value">${this.capabilities?.channelOrder.length ?? 0}</span>
          </div>
          <div class="hint">
            ${this.permissions?.fix
              ? this.permissions.fix
              : "Use strict mode + token auth + pairing/allowlist policies for production-grade channel control."}
          </div>
        </div>
      </div>

      ${latestEvents.length > 0
        ? html`
            <div class="card" style="margin-top: 10px; min-height: 0;">
              <div class="card-title">Recent Channel Warnings</div>
              <div class="list">
                ${latestEvents.map(
                  (row) => html`
                    <div class="log">
                      <div class="log-main">
                        <div class="log-title">
                          <span class="log-level ${row.level}">${row.level}</span>
                          ${row.channelId} · ${row.event}
                        </div>
                        <div class="log-meta">${row.message}</div>
                      </div>
                      <div class="log-time">${this.formatTimestamp(row.ts)}</div>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
        : nothing}

      ${this.error ? html`<div class="message error">${this.error}</div>` : nothing}
      ${this.warnings.length > 0
        ? html`<div class="message warn">${this.warnings.join(" · ")}</div>`
        : nothing}
    `;
  }
}
