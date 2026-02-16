import type { Channel, ChannelConfig, ChannelMessage, ChannelStatus } from "./types.js";
import { createBackoff, resetBackoff, scheduleReconnect, type BackoffState } from "./channel-utils.js";

export function createSlackChannel(): Channel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any = null;
  let connected = false;
  let accountName: string | undefined;
  let lastError: string | undefined;
  let botUserId: string | undefined;
  let startedAt: number | undefined;
  let lastConnectedAt: number | undefined;
  let lastDisconnectedAt: number | undefined;
  let lastErrorAt: number | undefined;
  let backoff: BackoffState = createBackoff();
  let savedConfig: ChannelConfig | undefined;
  let savedOnMessage: ((msg: ChannelMessage) => void) | undefined;

  return {
    id: "slack",
    name: "Slack",

    async start(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void) {
      if (!config.token) throw new Error("Slack bot token is required");
      const appToken = config.extra?.appToken as string | undefined;
      if (!appToken) throw new Error("Slack app-level token (appToken) is required for Socket Mode");
      savedConfig = config;
      savedOnMessage = onMessage;
      startedAt = startedAt ?? Date.now();

      const bolt = await import("@slack/bolt");
      const App = bolt.default?.App ?? bolt.App;

      app = new App({
        token: config.token,
        appToken,
        socketMode: true,
      });

      app.message(async ({ message }: { message: Record<string, unknown> }) => {
        const msg = message as { user?: string; text?: string; ts?: string; thread_ts?: string; channel?: string; channel_type?: string; subtype?: string };
        if (msg.subtype || !msg.text || !msg.user) return;
        if (msg.user === botUserId) return;

        const isDM = msg.channel_type === "im";

        const channelMsg: ChannelMessage = {
          id: msg.ts ?? String(Date.now()),
          channelId: "slack",
          from: msg.user,
          to: msg.channel ?? "",
          text: msg.text,
          threadId: msg.thread_ts,
          timestamp: msg.ts ? parseFloat(msg.ts) * 1000 : Date.now(),
          chatType: isDM ? "direct" : "group",
          raw: message,
        };

        onMessage(channelMsg);
      });

      app.error(async () => {
        connected = false;
        lastDisconnectedAt = Date.now();
        lastErrorAt = Date.now();
        if (savedConfig && savedOnMessage) {
          scheduleReconnect(backoff, () => this.start(savedConfig!, savedOnMessage!));
        }
      });

      try {
        await app.start();
        const authResult = await app.client.auth.test({ token: config.token });
        accountName = authResult.user as string | undefined;
        botUserId = authResult.user_id as string | undefined;
        connected = true;
        lastConnectedAt = Date.now();
        lastError = undefined;
        resetBackoff(backoff);
      } catch (err) {
        lastError = (err as Error).message;
        lastErrorAt = Date.now();
        connected = false;
        throw err;
      }
    },

    async stop() {
      resetBackoff(backoff);
      if (app) {
        await app.stop();
        app = null;
      }
      connected = false;
    },

    async send(to: string, text: string, opts?: { threadId?: string }) {
      if (!app) throw new Error("Slack app not started");
      await app.client.chat.postMessage({
        channel: to,
        text,
        thread_ts: opts?.threadId,
      });
    },

    status(): ChannelStatus {
      return {
        channelId: "slack", connected, accountName, error: lastError,
        reconnectAttempts: backoff.attempt, startedAt, lastConnectedAt, lastDisconnectedAt, lastErrorAt,
      };
    },
  };
}
