import type { Channel, ChannelConfig, ChannelMessage, ChannelStatus } from "./types.js";
import { createBackoff, resetBackoff, scheduleReconnect, type BackoffState } from "./channel-utils.js";

let discordModule: typeof import("discord.js") | null = null;

async function loadDiscord() {
  if (!discordModule) discordModule = await import("discord.js");
  return discordModule;
}

export function createDiscordChannel(): Channel {
  let client: InstanceType<typeof import("discord.js").Client> | null = null;
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
    id: "discord",
    name: "Discord",

    async start(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void) {
      if (!config.token) throw new Error("Discord bot token is required");
      savedConfig = config;
      savedOnMessage = onMessage;
      startedAt = startedAt ?? Date.now();
      const { Client, GatewayIntentBits } = await loadDiscord();

      client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
      });

      client.on("messageCreate", (message) => {
        if (message.author.bot) return;

        const isDM = !message.guild;
        const isMentioned = message.mentions.users.has(client!.user!.id);
        const isReply = message.reference?.messageId != null;
        if (!isDM && !isMentioned && !isReply) return;

        const channelMsg: ChannelMessage = {
          id: message.id,
          channelId: "discord",
          from: message.author.id,
          fromName: message.author.displayName ?? message.author.username,
          to: message.channelId,
          text: message.content,
          threadId: message.reference?.messageId ?? undefined,
          timestamp: message.createdTimestamp,
          chatType: isDM ? "direct" : "group",
          raw: message,
        };
        onMessage(channelMsg);
      });

      client.on("error", () => {
        connected = false;
        lastDisconnectedAt = Date.now();
        lastErrorAt = Date.now();
        if (savedConfig && savedOnMessage) {
          scheduleReconnect(backoff, () => this.start(savedConfig!, savedOnMessage!));
        }
      });

      try {
        await client.login(config.token);
        accountName = client.user?.username;
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
      if (client) {
        client.destroy();
        client = null;
      }
      connected = false;
    },

    async send(to: string, text: string) {
      if (!client) throw new Error("Discord client not started");
      const channel = await client.channels.fetch(to);
      if (channel && "send" in channel) {
        await (channel as { send: (t: string) => Promise<unknown> }).send(text);
      }
    },

    status(): ChannelStatus {
      return {
        channelId: "discord", connected, accountName, error: lastError,
        reconnectAttempts: backoff.attempt, startedAt, lastConnectedAt, lastDisconnectedAt, lastErrorAt,
      };
    },
  };
}
