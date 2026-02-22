import { describe, expect, it } from "vitest";
import {
  collectChannelSecurityFindings,
  summarizeChannelSecurity,
  type ChannelSecuritySnapshot,
} from "./channel-security.js";

function snapshot(
  overrides: Partial<ChannelSecuritySnapshot> & Pick<ChannelSecuritySnapshot, "channelId">,
): ChannelSecuritySnapshot {
  const { channelId, ...rest } = overrides;
  return {
    channelId,
    configured: true,
    enabled: true,
    connected: true,
    status: "connected",
    dmPolicy: "pairing",
    allowlistCount: 0,
    pairingPending: 0,
    pairingApproved: 0,
    diagnostics: [],
    ...rest,
  };
}

describe("channel-security", () => {
  it("creates findings for open dm policy, empty allowlist, and pairing backlog", () => {
    const findings = collectChannelSecurityFindings([
      snapshot({
        channelId: "telegram",
        dmPolicy: "open",
        pairingPending: 2,
      }),
      snapshot({
        channelId: "slack",
        dmPolicy: "allowlist",
        allowlistCount: 0,
      }),
    ]);

    expect(findings.map((f) => `${f.channelId}:${f.code}`)).toEqual(
      expect.arrayContaining([
        "telegram:dm_open_policy",
        "telegram:pairing_pending",
        "slack:allowlist_empty",
      ]),
    );
    expect(findings.find((f) => f.code === "allowlist_empty")?.severity).toBe("error");
  });

  it("promotes diagnostic warnings/errors and excludes info diagnostics", () => {
    const findings = collectChannelSecurityFindings([
      snapshot({
        channelId: "discord",
        diagnostics: [
          { code: "runtime_error", severity: "error", message: "Auth failed." },
          { code: "configured_but_disabled", severity: "info", message: "Disabled." },
        ],
      }),
    ]);

    expect(findings.map((f) => f.code)).toContain("runtime_error");
    expect(findings.map((f) => f.code)).not.toContain("configured_but_disabled");
  });

  it("summarizes risky channels and severity totals", () => {
    const snapshots = [
      snapshot({ channelId: "telegram", dmPolicy: "open" }),
      snapshot({ channelId: "discord", connected: true, status: "connected" }),
    ];
    const findings = collectChannelSecurityFindings(snapshots);
    const summary = summarizeChannelSecurity(snapshots, findings);

    expect(summary.totalChannels).toBe(2);
    expect(summary.riskyChannels).toBe(1);
    expect(summary.okChannels).toBe(1);
    expect(summary.warn).toBeGreaterThan(0);
  });
});
