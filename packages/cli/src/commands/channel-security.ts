export type ChannelDiagnostic = {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  recovery?: string;
};

export type ChannelSecuritySnapshot = {
  channelId: string;
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  status: "connected" | "awaiting_scan" | "error" | "offline";
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
  allowlistCount: number;
  pairingPending?: number;
  pairingApproved?: number;
  diagnostics: ChannelDiagnostic[];
};

export type ChannelSecurityFinding = {
  channelId: string;
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  recovery?: string;
};

export type ChannelSecuritySummary = {
  info: number;
  warn: number;
  error: number;
  okChannels: number;
  riskyChannels: number;
  totalChannels: number;
};

function rankSeverity(severity: ChannelSecurityFinding["severity"]): number {
  switch (severity) {
    case "error":
      return 3;
    case "warn":
      return 2;
    default:
      return 1;
  }
}

export function collectChannelSecurityFindings(
  snapshots: ChannelSecuritySnapshot[],
): ChannelSecurityFinding[] {
  const findings: ChannelSecurityFinding[] = [];
  const dedupe = new Set<string>();

  const add = (finding: ChannelSecurityFinding) => {
    const key = `${finding.channelId}:${finding.code}`;
    if (dedupe.has(key)) return;
    dedupe.add(key);
    findings.push(finding);
  };

  for (const snapshot of snapshots) {
    for (const diagnostic of snapshot.diagnostics) {
      if (diagnostic.severity === "info") continue;
      add({
        channelId: snapshot.channelId,
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        recovery: diagnostic.recovery,
      });
    }

    if (snapshot.dmPolicy === "open") {
      add({
        channelId: snapshot.channelId,
        code: "dm_open_policy",
        severity: "warn",
        message: "DM policy is open; any sender can trigger agent actions.",
        recovery: "Set DM policy to pairing or allowlist for controlled access.",
      });
    }

    if (snapshot.dmPolicy === "allowlist" && snapshot.allowlistCount === 0) {
      add({
        channelId: snapshot.channelId,
        code: "allowlist_empty",
        severity: "error",
        message: "Allowlist mode is active but allowlist is empty.",
        recovery: "Add at least one user to the channel allowlist.",
      });
    }

    if (snapshot.enabled && snapshot.configured && !snapshot.connected && snapshot.status === "offline") {
      add({
        channelId: snapshot.channelId,
        code: "configured_offline",
        severity: "warn",
        message: "Channel is configured and enabled but not connected.",
        recovery: "Restart the channel and verify credentials/network reachability.",
      });
    }

    if ((snapshot.pairingPending ?? 0) > 0) {
      add({
        channelId: snapshot.channelId,
        code: "pairing_pending",
        severity: "warn",
        message: `${snapshot.pairingPending} pending pairing request(s) waiting for approval.`,
        recovery: "Review and approve/reject pending requests.",
      });
    }
  }

  findings.sort((a, b) => {
    const severityDiff = rankSeverity(b.severity) - rankSeverity(a.severity);
    if (severityDiff !== 0) return severityDiff;
    const channelDiff = a.channelId.localeCompare(b.channelId);
    if (channelDiff !== 0) return channelDiff;
    return a.code.localeCompare(b.code);
  });
  return findings;
}

export function summarizeChannelSecurity(
  snapshots: ChannelSecuritySnapshot[],
  findings: ChannelSecurityFinding[],
): ChannelSecuritySummary {
  const byChannel = new Map<string, number>();
  for (const finding of findings) {
    const existing = byChannel.get(finding.channelId) ?? 0;
    byChannel.set(finding.channelId, Math.max(existing, rankSeverity(finding.severity)));
  }

  let info = 0;
  let warn = 0;
  let error = 0;
  for (const finding of findings) {
    if (finding.severity === "error") error += 1;
    else if (finding.severity === "warn") warn += 1;
    else info += 1;
  }

  return {
    info,
    warn,
    error,
    okChannels: snapshots.length - byChannel.size,
    riskyChannels: byChannel.size,
    totalChannels: snapshots.length,
  };
}

