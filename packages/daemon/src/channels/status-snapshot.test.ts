import { describe, expect, it } from "vitest";
import { buildChannelStatusSnapshot } from "./status-snapshot.js";
import type { ChannelConfig, ChannelStatus } from "./types.js";

function makeConfig(partial: Partial<ChannelConfig>): ChannelConfig {
  return {
    channelId: "telegram",
    enabled: false,
    ...partial,
  };
}

function makeStatus(partial: Partial<ChannelStatus>): ChannelStatus {
  return {
    channelId: "telegram",
    connected: false,
    ...partial,
  };
}

describe("buildChannelStatusSnapshot", () => {
  it("treats WhatsApp as configured without token", () => {
    const snapshot = buildChannelStatusSnapshot(
      makeConfig({ channelId: "whatsapp", enabled: true }),
      makeStatus({ channelId: "whatsapp", connected: false }),
    );
    expect(snapshot.configured).toBe(true);
    expect(snapshot.needsSetup).toBe(false);
  });

  it("requires Slack app token in addition to bot token", () => {
    const missingAppToken = buildChannelStatusSnapshot(
      makeConfig({ channelId: "slack", enabled: true, token: "xoxb-123" }),
      makeStatus({ channelId: "slack", connected: false }),
    );
    expect(missingAppToken.configured).toBe(false);
    expect(missingAppToken.diagnostics.some((d) => d.code === "missing_credentials")).toBe(true);

    const configured = buildChannelStatusSnapshot(
      makeConfig({
        channelId: "slack",
        enabled: true,
        token: "xoxb-123",
        extra: { appToken: "xapp-123" },
      }),
      makeStatus({ channelId: "slack", connected: false }),
    );
    expect(configured.configured).toBe(true);
  });

  it("emits allowlist_empty warning when allowlist mode has no entries", () => {
    const snapshot = buildChannelStatusSnapshot(
      makeConfig({
        channelId: "telegram",
        enabled: true,
        token: "token",
        extra: { dmPolicy: "allowlist" },
      }),
      makeStatus({ channelId: "telegram", connected: true }),
    );
    expect(snapshot.dmPolicy).toBe("allowlist");
    expect(snapshot.diagnostics.some((d) => d.code === "allowlist_empty")).toBe(true);
  });

  it("reports awaiting_qr_scan for WhatsApp QR-ready sessions", () => {
    const snapshot = buildChannelStatusSnapshot(
      makeConfig({ channelId: "whatsapp", enabled: true }),
      makeStatus({
        channelId: "whatsapp",
        connected: false,
        qrDataUrl: "data:image/png;base64,AAA",
      }),
    );
    expect(snapshot.status).toBe("awaiting_scan");
    expect(snapshot.diagnostics.some((d) => d.code === "awaiting_qr_scan")).toBe(true);
  });
});
