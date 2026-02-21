import { Command } from "commander";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import { daemonRequest } from "./daemon-client.js";
import {
  getChannelOnboardingAdapter,
  type ChannelId,
  type ChannelOnboardingConfig,
  type DmPolicy,
} from "../wizard/channel-adapters/index.js";
import {
  collectChannelSecurityFindings,
  summarizeChannelSecurity,
  type ChannelSecurityFinding,
  type ChannelSecuritySnapshot,
} from "./channel-security.js";

type ChannelStatusDiagnostic = {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  recovery?: string;
};

type ChannelStatusSnapshot = {
  channelId: ChannelId;
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  status: "connected" | "awaiting_scan" | "error" | "offline";
  dmPolicy: DmPolicy;
  allowlistCount: number;
  error?: string;
  diagnostics: ChannelStatusDiagnostic[];
};

type ChannelStatusResult = {
  channelOrder: string[];
  channels: Record<string, unknown>;
  channelAccounts: Record<string, unknown>;
  channelDefaultAccountId: Record<string, string>;
  channelSnapshots?: Record<string, ChannelStatusSnapshot>;
  channelDiagnostics?: Record<string, ChannelStatusDiagnostic[]>;
};

type ChannelSecurityAuditResult = {
  snapshots: ChannelSecuritySnapshot[];
  findings: ChannelSecurityFinding[];
  summary: ReturnType<typeof summarizeChannelSecurity>;
};

type ChannelProbeCheck = {
  name: string;
  ok: boolean;
  severity: "info" | "warn" | "error";
  message: string;
};

type ChannelProbe = {
  channelId: ChannelId;
  probedAt: number;
  connected: boolean;
  ok: boolean;
  checks: ChannelProbeCheck[];
};

type ChannelProbeResult = {
  ts: number;
  deep: boolean;
  channelOrder: string[];
  probes: Record<string, ChannelProbe>;
  okCount: number;
  failCount: number;
};

type ChannelCapabilitiesResult = {
  ts: number;
  channelOrder: string[];
  capabilities: Record<string, unknown>;
};

type ChannelLogEntry = {
  id: string;
  ts: number;
  channelId: ChannelId;
  level: "info" | "warn" | "error";
  event: string;
  message: string;
  meta?: Record<string, unknown>;
};

type ChannelLogsResult = {
  ts: number;
  channel: ChannelId | null;
  limit: number;
  count: number;
  logs: ChannelLogEntry[];
};

type ChannelResolveEntry = {
  input: string;
  resolved: string | null;
  type: "user" | "group" | "unknown";
  confidence: "high" | "medium" | "low";
  note?: string;
};

type ChannelResolveResult = {
  channel: ChannelId;
  kind: "auto" | "user" | "group";
  resolved: ChannelResolveEntry[];
};

type ChannelRow = {
  config: ChannelOnboardingConfig;
  status: {
    channelId: ChannelId;
    connected: boolean;
    accountName?: string;
    error?: string;
    qrDataUrl?: string;
  };
  snapshot?: ChannelStatusSnapshot;
};

const CHANNELS = new Set<ChannelId>(["telegram", "discord", "slack", "whatsapp"]);
const DM_POLICIES = new Set<DmPolicy>(["pairing", "allowlist", "open", "disabled"]);

function parseChannelId(value: string): ChannelId {
  const normalized = value.trim().toLowerCase();
  if (!CHANNELS.has(normalized as ChannelId)) {
    throw new Error(`Invalid channel "${value}". Use: telegram, discord, slack, whatsapp.`);
  }
  return normalized as ChannelId;
}

function parseDmPolicy(value?: string): DmPolicy | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!DM_POLICIES.has(normalized as DmPolicy)) {
    throw new Error(`Invalid dm policy "${value}". Use: pairing, allowlist, open, disabled.`);
  }
  return normalized as DmPolicy;
}

function parseAllowlist(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const list = raw
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length > 0 ? [...new Set(list)] : [];
}

function parseResolveKind(value?: string): "auto" | "user" | "group" {
  if (!value) return "auto";
  const normalized = value.trim().toLowerCase();
  if (normalized === "user" || normalized === "group" || normalized === "auto") {
    return normalized;
  }
  throw new Error(`Invalid resolve kind "${value}". Use: auto, user, group.`);
}

function deriveDmPolicy(config: ChannelOnboardingConfig): DmPolicy {
  const fromExtra = typeof config.extra?.dmPolicy === "string"
    ? config.extra.dmPolicy.trim().toLowerCase()
    : "";
  if (DM_POLICIES.has(fromExtra as DmPolicy)) return fromExtra as DmPolicy;
  if (config.allowDMs === false) return "disabled";
  if (Array.isArray(config.userAllowlist) && config.userAllowlist.length > 0) return "allowlist";
  return "pairing";
}

function toStatusSnapshot(row: ChannelRow): ChannelStatusSnapshot {
  if (row.snapshot) return row.snapshot;
  return {
    channelId: row.config.channelId,
    configured: Boolean(row.config.token || row.config.extra),
    enabled: row.config.enabled,
    connected: row.status.connected,
    status: row.status.connected ? "connected" : row.status.error ? "error" : row.status.qrDataUrl ? "awaiting_scan" : "offline",
    dmPolicy: deriveDmPolicy(row.config),
    allowlistCount: row.config.userAllowlist?.length ?? 0,
    error: row.status.error,
    diagnostics: row.status.error ? [{ code: "runtime_error", severity: "error", message: row.status.error }] : [],
  };
}

function toSecuritySnapshot(
  snapshot: ChannelStatusSnapshot,
  row: Record<string, unknown> | undefined,
): ChannelSecuritySnapshot {
  return {
    channelId: snapshot.channelId,
    configured: snapshot.configured,
    enabled: snapshot.enabled,
    connected: snapshot.connected,
    status: snapshot.status,
    dmPolicy: snapshot.dmPolicy,
    allowlistCount: snapshot.allowlistCount,
    diagnostics: snapshot.diagnostics,
    pairingPending: row && typeof row.pairingPending === "number" ? row.pairingPending : 0,
    pairingApproved: row && typeof row.pairingApproved === "number" ? row.pairingApproved : 0,
  };
}

function buildSecurityAuditFromStatus(result: ChannelStatusResult): ChannelSecurityAuditResult {
  const snapshotsMap = result.channelSnapshots ?? {};
  const order = result.channelOrder ?? Object.keys(snapshotsMap);
  const snapshots: ChannelSecuritySnapshot[] = [];

  for (const channelId of order) {
    const snapshot = snapshotsMap[channelId];
    if (!snapshot) continue;
    const meta = result.channels[channelId];
    const metaRecord = meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : undefined;
    snapshots.push(toSecuritySnapshot(snapshot, metaRecord));
  }

  const findings = collectChannelSecurityFindings(snapshots);
  const summary = summarizeChannelSecurity(snapshots, findings);
  return { snapshots, findings, summary };
}

function printSecurityAudit(result: ChannelSecurityAuditResult): void {
  console.log(
    `Channels: total=${result.summary.totalChannels} ok=${result.summary.okChannels} risky=${result.summary.riskyChannels}`,
  );
  console.log(
    `Findings: error=${result.summary.error} warn=${result.summary.warn} info=${result.summary.info}`,
  );
  for (const finding of result.findings) {
    const recovery = finding.recovery ? ` | recovery: ${finding.recovery}` : "";
    console.log(`- [${finding.severity}] ${finding.channelId} ${finding.code}: ${finding.message}${recovery}`);
  }
}

async function gatewayCall<T>(
  method: string,
  params: Record<string, unknown>,
  opts: { url?: string; token?: string },
): Promise<T> {
  const rpc = await daemonRequest<
    | { ok: true; result: T }
    | { ok: false; error: { code: string; message: string } }
  >("/gateway", {
    url: opts.url,
    token: opts.token,
    method: "POST",
    body: { method, params },
  });

  if (!rpc.ok) throw new Error(rpc.error.message);
  return rpc.result;
}

function printSnapshots(snapshots: ChannelStatusSnapshot[], showDiagnostics: boolean) {
  for (const snapshot of snapshots) {
    const line = [
      snapshot.channelId.padEnd(9, " "),
      `status=${snapshot.status}`,
      `enabled=${snapshot.enabled ? "yes" : "no"}`,
      `configured=${snapshot.configured ? "yes" : "no"}`,
      `connected=${snapshot.connected ? "yes" : "no"}`,
      `dm=${snapshot.dmPolicy}`,
      snapshot.allowlistCount > 0 ? `allowlist=${snapshot.allowlistCount}` : "",
      snapshot.error ? `error=${snapshot.error}` : "",
    ].filter(Boolean).join("  ");
    console.log(line);

    if (showDiagnostics && snapshot.diagnostics.length > 0) {
      for (const diagnostic of snapshot.diagnostics) {
        const detail = diagnostic.recovery
          ? `${diagnostic.message} | recovery: ${diagnostic.recovery}`
          : diagnostic.message;
        console.log(`  - [${diagnostic.severity}] ${diagnostic.code}: ${detail}`);
      }
    }
  }
}

function printProbeResult(result: ChannelProbeResult) {
  for (const channelId of result.channelOrder) {
    const probe = result.probes[channelId];
    if (!probe) continue;
    console.log(`${probe.channelId.padEnd(9, " ")} ok=${probe.ok ? "yes" : "no"} connected=${probe.connected ? "yes" : "no"}`);
    for (const check of probe.checks) {
      console.log(`  - [${check.severity}] ${check.name}: ${check.message}`);
    }
  }
  console.log(`Summary: ok=${result.okCount} fail=${result.failCount}`);
}

function printCapabilities(result: ChannelCapabilitiesResult) {
  for (const channelId of result.channelOrder) {
    const row = result.capabilities[channelId];
    console.log(`${channelId}:`);
    console.log(JSON.stringify(row, null, 2));
  }
}

function printChannelLogs(result: ChannelLogsResult) {
  for (const row of result.logs) {
    console.log(`${new Date(row.ts).toISOString()} [${row.level}] ${row.channelId} ${row.event} - ${row.message}`);
  }
  console.log(`Count: ${result.count}`);
}

function printResolveResult(result: ChannelResolveResult) {
  for (const row of result.resolved) {
    const suffix = row.note ? ` (${row.note})` : "";
    console.log(`${row.input} -> ${row.resolved ?? "<unresolved>"} [${row.type}/${row.confidence}]${suffix}`);
  }
}

async function fetchSnapshots(opts: { channel?: string; url?: string; token?: string }): Promise<ChannelStatusSnapshot[]> {
  const channel = opts.channel ? parseChannelId(opts.channel) : undefined;
  try {
    const result = await gatewayCall<ChannelStatusResult>(
      "channels.status",
      channel ? { channel } : {},
      { url: opts.url, token: opts.token },
    );
    const snapshotsMap = result.channelSnapshots ?? {};
    const order = result.channelOrder ?? Object.keys(snapshotsMap);
    return order
      .map((channelId) => snapshotsMap[channelId])
      .filter((entry): entry is ChannelStatusSnapshot => Boolean(entry));
  } catch {
    const rows = channel
      ? [await daemonRequest<ChannelRow>(`/channels/${channel}`, { url: opts.url, token: opts.token })]
      : await daemonRequest<ChannelRow[]>("/channels", { url: opts.url, token: opts.token });
    return rows.map(toStatusSnapshot);
  }
}

function buildPatchFromOptions(params: {
  channel: ChannelId;
  current: ChannelOnboardingConfig;
  botToken?: string;
  appToken?: string;
  dmPolicy?: DmPolicy;
  allowlist?: string[];
}): Partial<ChannelOnboardingConfig> {
  const { channel, current, botToken, appToken, dmPolicy, allowlist } = params;
  const extra = { ...current.extra };
  if (dmPolicy) extra.dmPolicy = dmPolicy;
  if (allowlist) extra.allowlist = allowlist;
  if (channel === "slack" && appToken) extra.appToken = appToken;

  const patch: Partial<ChannelOnboardingConfig> = {
    enabled: true,
    extra,
  };
  if (botToken) patch.token = botToken;
  if (dmPolicy) {
    patch.allowDMs = dmPolicy !== "disabled";
    patch.allowGroups = true;
    patch.userAllowlist = dmPolicy === "allowlist" ? (allowlist ?? current.userAllowlist ?? []) : [];
  } else if (allowlist) {
    patch.userAllowlist = allowlist;
  }
  return patch;
}

export function channelsCommand(): Command {
  const cmd = new Command("channels")
    .description("Dedicated channel management (status/probe/capabilities/logs/resolve/add/start/login/stop/logout/remove)");

  const registerStatus = (name: "status" | "list") =>
    cmd
      .command(name)
      .description(name === "status" ? "Show channel status snapshots" : "List channel status snapshots")
      .option("--channel <channel>", "Filter by channel: telegram|discord|slack|whatsapp")
      .option("--details", "Show diagnostics and recovery hints", false)
      .option("--url <url>", "Daemon base URL (default: http://127.0.0.1:7433)")
      .option("--token <token>", "Daemon bearer token")
      .option("--json", "Output raw JSON")
      .action(async (opts: { channel?: string; details?: boolean; url?: string; token?: string; json?: boolean }) => {
        const snapshots = await fetchSnapshots({ channel: opts.channel, url: opts.url, token: opts.token });
        if (opts.json) {
          console.log(JSON.stringify(snapshots, null, 2));
          return;
        }
        printSnapshots(snapshots, opts.details === true);
      });

  registerStatus("status");
  registerStatus("list");

  cmd
    .command("audit")
    .description("Audit channel security posture (DM policy, allowlists, pairing backlog, runtime diagnostics)")
    .option("--channel <channel>", "Filter by channel: telegram|discord|slack|whatsapp")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .option("--json", "Output raw JSON")
    .option("--fail-on-warn", "Exit with code 1 for warnings too", false)
    .action(async (opts: {
      channel?: string;
      url?: string;
      token?: string;
      json?: boolean;
      failOnWarn?: boolean;
    }) => {
      const channel = opts.channel ? parseChannelId(opts.channel) : undefined;
      const result = await gatewayCall<ChannelStatusResult>(
        "channels.status",
        channel ? { channel } : {},
        { url: opts.url, token: opts.token },
      );
      const audit = buildSecurityAuditFromStatus(result);
      if (opts.json) {
        console.log(JSON.stringify(audit, null, 2));
      } else {
        printSecurityAudit(audit);
      }
      const hasErrors = audit.summary.error > 0;
      const hasWarnings = audit.summary.warn > 0;
      if (hasErrors || (opts.failOnWarn && hasWarnings)) {
        process.exitCode = 1;
      }
    });

  cmd
    .command("probe")
    .description("Run deep channel probes (credentials/runtime health)")
    .option("--channel <channel>", "Filter by channel: telegram|discord|slack|whatsapp")
    .option("--no-deep", "Skip live auth probe checks")
    .option("--timeout-ms <ms>", "Probe timeout per channel")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .option("--json", "Output raw JSON")
    .action(async (opts: {
      channel?: string;
      deep?: boolean;
      timeoutMs?: string;
      url?: string;
      token?: string;
      json?: boolean;
    }) => {
      const channel = opts.channel ? parseChannelId(opts.channel) : undefined;
      const timeoutMs = opts.timeoutMs ? Number(opts.timeoutMs) : undefined;
      const result = await gatewayCall<ChannelProbeResult>(
        "channels.probe",
        {
          ...(channel ? { channel } : {}),
          deep: opts.deep !== false,
          ...(typeof timeoutMs === "number" && Number.isFinite(timeoutMs) ? { timeoutMs } : {}),
        },
        { url: opts.url, token: opts.token },
      );
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printProbeResult(result);
    });

  cmd
    .command("capabilities")
    .description("Show channel capabilities and supported actions")
    .option("--channel <channel>", "Filter by channel: telegram|discord|slack|whatsapp")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .option("--json", "Output raw JSON")
    .action(async (opts: { channel?: string; url?: string; token?: string; json?: boolean }) => {
      const channel = opts.channel ? parseChannelId(opts.channel) : undefined;
      const result = await gatewayCall<ChannelCapabilitiesResult>(
        "channels.capabilities",
        channel ? { channel } : {},
        { url: opts.url, token: opts.token },
      );
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printCapabilities(result);
    });

  cmd
    .command("logs")
    .description("Show recent channel logs")
    .option("--channel <channel>", "Filter by channel: telegram|discord|slack|whatsapp")
    .option("--limit <n>", "Number of log entries (default: 200)", "200")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .option("--json", "Output raw JSON")
    .action(async (opts: { channel?: string; limit?: string; url?: string; token?: string; json?: boolean }) => {
      const channel = opts.channel ? parseChannelId(opts.channel) : undefined;
      const limit = opts.limit ? Number(opts.limit) : 200;
      const result = await gatewayCall<ChannelLogsResult>(
        "channels.logs",
        {
          ...(channel ? { channel } : {}),
          ...(Number.isFinite(limit) ? { limit } : {}),
        },
        { url: opts.url, token: opts.token },
      );
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printChannelLogs(result);
    });

  cmd
    .command("resolve")
    .description("Resolve user/channel names to platform IDs")
    .requiredOption("--channel <channel>", "Channel: telegram|discord|slack|whatsapp")
    .argument("<entries...>", "Names, mentions, IDs, or targets to resolve")
    .option("--kind <kind>", "Resolve kind: auto|user|group", "auto")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .option("--json", "Output raw JSON")
    .action(async (
      entries: string[],
      opts: {
        channel: string;
        kind?: string;
        url?: string;
        token?: string;
        json?: boolean;
      },
    ) => {
      const channel = parseChannelId(opts.channel);
      const kind = parseResolveKind(opts.kind);
      const result = await gatewayCall<ChannelResolveResult>(
        "channels.resolve",
        { channel, kind, entries },
        { url: opts.url, token: opts.token },
      );
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printResolveResult(result);
    });

  cmd
    .command("add")
    .description("Configure channel credentials/policy (supports interactive onboarding adapters)")
    .requiredOption("--channel <channel>", "Channel: telegram|discord|slack|whatsapp")
    .option("--bot-token <token>", "Bot/API token for telegram/discord/slack")
    .option("--app-token <token>", "Slack app-level token (xapp-...)")
    .option("--dm-policy <policy>", "DM policy: pairing|allowlist|open|disabled")
    .option("--allowlist <list>", "Allowlist entries (comma/newline/semicolon separated)")
    .option("--start", "Start the channel after saving config", false)
    .option("--non-interactive", "Skip interactive adapter prompts", false)
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .action(async (opts: {
      channel: string;
      botToken?: string;
      appToken?: string;
      dmPolicy?: string;
      allowlist?: string;
      start?: boolean;
      nonInteractive?: boolean;
      url?: string;
      token?: string;
    }) => {
      const channel = parseChannelId(opts.channel);
      const current = await daemonRequest<ChannelRow>(`/channels/${channel}`, { url: opts.url, token: opts.token });
      const dmPolicy = parseDmPolicy(opts.dmPolicy);
      const allowlist = parseAllowlist(opts.allowlist);

      let patch: Partial<ChannelOnboardingConfig>;
      if (opts.nonInteractive) {
        patch = buildPatchFromOptions({
          channel,
          current: current.config,
          botToken: opts.botToken,
          appToken: opts.appToken,
          dmPolicy,
          allowlist,
        });
      } else {
        const prompter = createClackPrompter();
        const adapter = getChannelOnboardingAdapter(channel);
        const interactive = await adapter.configure({
          prompter,
          existing: current.config,
        });
        patch = {
          ...interactive,
          ...buildPatchFromOptions({
            channel,
            current: interactive,
            botToken: opts.botToken,
            appToken: opts.appToken,
            dmPolicy,
            allowlist,
          }),
        };
      }

      await daemonRequest(`/channels/${channel}`, {
        url: opts.url,
        token: opts.token,
        method: "PUT",
        body: patch,
      });

      if (opts.start) {
        await daemonRequest(`/channels/${channel}/start`, {
          url: opts.url,
          token: opts.token,
          method: "POST",
        });
      }

      console.log(`Configured ${channel}${opts.start ? " and started" : ""}.`);
    });

  cmd
    .command("start")
    .description("Start a channel")
    .requiredOption("--channel <channel>", "Channel: telegram|discord|slack|whatsapp")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .action(async (opts: { channel: string; url?: string; token?: string }) => {
      const channel = parseChannelId(opts.channel);
      await daemonRequest(`/channels/${channel}`, {
        url: opts.url,
        token: opts.token,
        method: "PUT",
        body: { enabled: true },
      });
      await daemonRequest(`/channels/${channel}/start`, {
        url: opts.url,
        token: opts.token,
        method: "POST",
      });
      console.log(`Started ${channel}.`);
    });

  cmd
    .command("login")
    .description("Login/pair a channel session (WhatsApp QR flow supported)")
    .requiredOption("--channel <channel>", "Channel: telegram|discord|slack|whatsapp")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .action(async (opts: { channel: string; url?: string; token?: string }) => {
      const channel = parseChannelId(opts.channel);
      await daemonRequest(`/channels/${channel}`, {
        url: opts.url,
        token: opts.token,
        method: "PUT",
        body: { enabled: true },
      });
      await daemonRequest(`/channels/${channel}/start`, {
        url: opts.url,
        token: opts.token,
        method: "POST",
      });

      const row = await daemonRequest<ChannelRow>(`/channels/${channel}`, {
        url: opts.url,
        token: opts.token,
      });
      if (channel === "whatsapp") {
        if (row.status.qrDataUrl) {
          console.log("WhatsApp QR is ready. Open Channels UI and scan it from Linked Devices.");
        } else {
          console.log("WhatsApp started. QR may still be generating.");
        }
      } else {
        console.log(`${channel} login/start completed.`);
      }
    });

  cmd
    .command("stop")
    .description("Stop a channel and disable autostart")
    .requiredOption("--channel <channel>", "Channel: telegram|discord|slack|whatsapp")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .action(async (opts: { channel: string; url?: string; token?: string }) => {
      const channel = parseChannelId(opts.channel);
      await daemonRequest(`/channels/${channel}/stop`, {
        url: opts.url,
        token: opts.token,
        method: "POST",
      });
      await daemonRequest(`/channels/${channel}`, {
        url: opts.url,
        token: opts.token,
        method: "PUT",
        body: { enabled: false },
      });
      console.log(`Stopped ${channel}.`);
    });

  cmd
    .command("logout")
    .description("Logout channel account and clear active auth session")
    .requiredOption("--channel <channel>", "Channel: telegram|discord|slack|whatsapp")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .action(async (opts: { channel: string; url?: string; token?: string }) => {
      const channel = parseChannelId(opts.channel);
      await gatewayCall("channels.logout", { channel }, { url: opts.url, token: opts.token });
      console.log(`Logged out ${channel}.`);
    });

  cmd
    .command("remove")
    .description("Remove channel credentials/config and disable it")
    .requiredOption("--channel <channel>", "Channel: telegram|discord|slack|whatsapp")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .action(async (opts: { channel: string; url?: string; token?: string }) => {
      const channel = parseChannelId(opts.channel);
      try {
        await daemonRequest(`/channels/${channel}/stop`, {
          url: opts.url,
          token: opts.token,
          method: "POST",
        });
      } catch {
        // Best effort.
      }
      await daemonRequest(`/channels/${channel}`, {
        url: opts.url,
        token: opts.token,
        method: "PUT",
        body: {
          enabled: false,
          token: undefined,
          extra: {},
          userAllowlist: [],
          userBlocklist: [],
        },
      });
      console.log(`Removed config for ${channel}.`);
    });

  return cmd;
}
