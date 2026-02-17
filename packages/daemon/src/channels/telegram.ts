import type { Channel, ChannelConfig, ChannelMessage, ChannelStatus } from "./types.js";
import { createBackoff, resetBackoff, scheduleReconnect, type BackoffState } from "./channel-utils.js";

let grammyModule: typeof import("grammy") | null = null;

async function loadGrammy() {
  if (!grammyModule) grammyModule = await import("grammy");
  return grammyModule;
}

export function createTelegramChannel(): Channel {
  let bot: InstanceType<typeof import("grammy").Bot> | null = null;
  let connected = false;
  let accountName: string | undefined;
  let lastError: string | undefined;
  let startedAt: number | undefined;
  let lastConnectedAt: number | undefined;
  let lastDisconnectedAt: number | undefined;
  let lastErrorAt: number | undefined;
  let backoff: BackoffState = createBackoff();
  let savedConfig: ChannelConfig | undefined;
  let savedOnMessage: ((msg: ChannelMessage) => void) | undefined;

  return {
    id: "telegram",
    name: "Telegram",

    async start(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void) {
      if (!config.token) throw new Error("Telegram bot token is required");
      savedConfig = config;
      savedOnMessage = onMessage;
      startedAt = startedAt ?? Date.now();
      const { Bot } = await loadGrammy();
      bot = new Bot(config.token);

      bot.on("message:text", (ctx) => {
        const msg = ctx.message;
        const chatId = String(msg.chat.id);
        const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

        const channelMsg: ChannelMessage = {
          id: String(msg.message_id),
          channelId: "telegram",
          from: String(msg.from?.id ?? "unknown"),
          fromName: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || undefined,
          to: chatId,
          text: msg.text,
          threadId: msg.message_thread_id ? String(msg.message_thread_id) : undefined,
          timestamp: msg.date * 1000,
          chatType: isGroup ? "group" : "direct",
          raw: msg,
        };
        onMessage(channelMsg);
      });

      bot.catch(() => {
        connected = false;
        lastDisconnectedAt = Date.now();
        lastErrorAt = Date.now();
        if (savedConfig && savedOnMessage) {
          scheduleReconnect(backoff, () => this.start(savedConfig!, savedOnMessage!));
        }
      });

      try {
        const me = await bot.api.getMe();
        accountName = me.username ?? me.first_name;
        connected = true;
        lastConnectedAt = Date.now();
        lastError = undefined;
        resetBackoff(backoff);
        bot.start({ onStart: () => {} });
      } catch (err) {
        lastError = (err as Error).message;
        lastErrorAt = Date.now();
        connected = false;
        throw err;
      }
    },

    async stop() {
      resetBackoff(backoff);
      if (bot) {
        await bot.stop();
        bot = null;
      }
      connected = false;
    },

    async send(to: string, text: string, opts?: { threadId?: string }) {
      if (!bot) throw new Error("Telegram bot not started");
      await bot.api.sendMessage(Number(to), text, {
        message_thread_id: opts?.threadId ? Number(opts.threadId) : undefined,
      });
    },

    status(): ChannelStatus {
      return {
        channelId: "telegram", connected, accountName, error: lastError,
        reconnectAttempts: backoff.attempt, startedAt, lastConnectedAt, lastDisconnectedAt, lastErrorAt,
      };
    },

    getClient() {
      return bot;
    },
  };
}
