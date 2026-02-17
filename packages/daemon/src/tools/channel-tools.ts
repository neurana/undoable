import type { AgentTool } from "./types.js";
import type { ChannelManager } from "../channels/channel-manager.js";

function notConnected(channel: string) {
  return { error: `${channel} is not connected. Start it first via the Channels settings.` };
}

function createTelegramActionsTool(mgr: ChannelManager): AgentTool {
  const ACTIONS = ["send_message", "edit_message", "delete_message", "react", "read_messages", "pin", "unpin"] as const;

  return {
    name: "telegram_actions",
    definition: {
      type: "function",
      function: {
        name: "telegram_actions",
        description: [
          "Perform actions on Telegram: send/edit/delete messages, react, read history, pin/unpin.",
          "Requires the Telegram channel to be connected.",
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: [...ACTIONS], description: "Action to perform" },
            chat_id: { type: "string", description: "Telegram chat ID" },
            text: { type: "string", description: "Message text (send_message, edit_message)" },
            message_id: { type: "number", description: "Message ID (edit, delete, react, pin, unpin)" },
            emoji: { type: "string", description: "Emoji for react" },
            count: { type: "number", description: "Number of messages to read (default 10)" },
          },
          required: ["action", "chat_id"],
        },
      },
    },
    execute: async (args) => {
      const bot = mgr.getChannel("telegram")?.getClient() as import("grammy").Bot | null;
      if (!bot) return notConnected("Telegram");

      const action = args.action as string;
      const chatId = Number(args.chat_id);
      const messageId = args.message_id as number | undefined;
      const text = args.text as string | undefined;

      try {
        switch (action) {
          case "send_message": {
            if (!text) return { error: "text is required" };
            const sent = await bot.api.sendMessage(chatId, text);
            return { sent: true, message_id: sent.message_id };
          }
          case "edit_message": {
            if (!messageId || !text) return { error: "message_id and text are required" };
            await bot.api.editMessageText(chatId, messageId, text);
            return { edited: true };
          }
          case "delete_message": {
            if (!messageId) return { error: "message_id is required" };
            await bot.api.deleteMessage(chatId, messageId);
            return { deleted: true };
          }
          case "react": {
            if (!messageId) return { error: "message_id is required" };
            const emoji = (args.emoji as string) ?? "👍";
            await bot.api.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji: emoji as never }]);
            return { reacted: true, emoji };
          }
          case "read_messages": {
            return { error: "Telegram Bot API does not support reading chat history. Use the Telegram client API for this." };
          }
          case "pin": {
            if (!messageId) return { error: "message_id is required" };
            await bot.api.pinChatMessage(chatId, messageId);
            return { pinned: true };
          }
          case "unpin": {
            if (!messageId) return { error: "message_id is required" };
            await bot.api.unpinChatMessage(chatId, messageId);
            return { unpinned: true };
          }
          default:
            return { error: `Unknown action: ${action}` };
        }
      } catch (err) {
        return { error: `telegram_actions ${action} failed: ${(err as Error).message}` };
      }
    },
  };
}

function createDiscordActionsTool(mgr: ChannelManager): AgentTool {
  const ACTIONS = [
    "send_message", "edit_message", "delete_message", "react",
    "read_messages", "member_info", "role_add", "role_remove",
    "channel_list", "timeout", "kick", "ban",
  ] as const;

  return {
    name: "discord_actions",
    definition: {
      type: "function",
      function: {
        name: "discord_actions",
        description: [
          "Perform actions on Discord: send/edit/delete messages, react, read history,",
          "manage members (info, roles, timeout, kick, ban), list channels.",
          "Requires the Discord channel to be connected.",
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: [...ACTIONS], description: "Action to perform" },
            channel_id: { type: "string", description: "Discord channel ID" },
            guild_id: { type: "string", description: "Discord guild/server ID (for member/role actions)" },
            text: { type: "string", description: "Message text" },
            message_id: { type: "string", description: "Message ID" },
            user_id: { type: "string", description: "User ID (member actions)" },
            role_id: { type: "string", description: "Role ID (role_add, role_remove)" },
            emoji: { type: "string", description: "Emoji for react" },
            duration: { type: "number", description: "Timeout duration in seconds" },
            reason: { type: "string", description: "Reason for moderation action" },
            count: { type: "number", description: "Number of messages to read (default 10, max 50)" },
          },
          required: ["action"],
        },
      },
    },
    execute: async (args) => {
      const client = mgr.getChannel("discord")?.getClient() as import("discord.js").Client | null;
      if (!client) return notConnected("Discord");

      const action = args.action as string;
      const channelId = args.channel_id as string | undefined;
      const guildId = args.guild_id as string | undefined;
      const messageId = args.message_id as string | undefined;
      const userId = args.user_id as string | undefined;
      const text = args.text as string | undefined;

      try {
        switch (action) {
          case "send_message": {
            if (!channelId || !text) return { error: "channel_id and text are required" };
            const ch = await client.channels.fetch(channelId);
            if (!ch || !("send" in ch)) return { error: "Channel not found or not a text channel" };
            const sent = await (ch as { send: (t: string) => Promise<{ id: string }> }).send(text);
            return { sent: true, message_id: sent.id };
          }
          case "edit_message": {
            if (!channelId || !messageId || !text) return { error: "channel_id, message_id, and text are required" };
            const ch = await client.channels.fetch(channelId);
            if (!ch || !("messages" in ch)) return { error: "Channel not found" };
            const msg = await (ch as unknown as { messages: { fetch: (id: string) => Promise<{ edit: (t: string) => Promise<void> }> } }).messages.fetch(messageId);
            await msg.edit(text);
            return { edited: true };
          }
          case "delete_message": {
            if (!channelId || !messageId) return { error: "channel_id and message_id are required" };
            const ch = await client.channels.fetch(channelId);
            if (!ch || !("messages" in ch)) return { error: "Channel not found" };
            const msg = await (ch as unknown as { messages: { fetch: (id: string) => Promise<{ delete: () => Promise<void> }> } }).messages.fetch(messageId);
            await msg.delete();
            return { deleted: true };
          }
          case "react": {
            if (!channelId || !messageId) return { error: "channel_id and message_id are required" };
            const emoji = (args.emoji as string) ?? "👍";
            const ch = await client.channels.fetch(channelId);
            if (!ch || !("messages" in ch)) return { error: "Channel not found" };
            const msg = await (ch as unknown as { messages: { fetch: (id: string) => Promise<{ react: (e: string) => Promise<void> }> } }).messages.fetch(messageId);
            await msg.react(emoji);
            return { reacted: true, emoji };
          }
          case "read_messages": {
            if (!channelId) return { error: "channel_id is required" };
            const count = Math.min(50, Math.max(1, (args.count as number) ?? 10));
            const ch = await client.channels.fetch(channelId);
            if (!ch || !("messages" in ch)) return { error: "Channel not found" };
            const msgs = await (ch as { messages: { fetch: (o: { limit: number }) => Promise<Map<string, { id: string; content: string; author: { username: string }; createdTimestamp: number }>> } }).messages.fetch({ limit: count });
            const results = Array.from(msgs.values()).map((m) => ({
              id: m.id, text: m.content, author: m.author.username, timestamp: m.createdTimestamp,
            }));
            return { messages: results, count: results.length };
          }
          case "member_info": {
            if (!guildId || !userId) return { error: "guild_id and user_id are required" };
            const guild = await client.guilds.fetch(guildId);
            const member = await guild.members.fetch(userId);
            return {
              id: member.id,
              username: member.user.username,
              displayName: member.displayName,
              roles: member.roles.cache.map((r) => ({ id: r.id, name: r.name })),
              joinedAt: member.joinedTimestamp,
            };
          }
          case "role_add": {
            if (!guildId || !userId || !(args.role_id as string)) return { error: "guild_id, user_id, and role_id are required" };
            const guild = await client.guilds.fetch(guildId);
            const member = await guild.members.fetch(userId);
            await member.roles.add(args.role_id as string);
            return { added: true };
          }
          case "role_remove": {
            if (!guildId || !userId || !(args.role_id as string)) return { error: "guild_id, user_id, and role_id are required" };
            const guild = await client.guilds.fetch(guildId);
            const member = await guild.members.fetch(userId);
            await member.roles.remove(args.role_id as string);
            return { removed: true };
          }
          case "channel_list": {
            if (!guildId) return { error: "guild_id is required" };
            const guild = await client.guilds.fetch(guildId);
            const channels = await guild.channels.fetch();
            return {
              channels: Array.from(channels.values()).filter(Boolean).map((c) => ({
                id: c!.id, name: c!.name, type: c!.type,
              })),
            };
          }
          case "timeout": {
            if (!guildId || !userId) return { error: "guild_id and user_id are required" };
            const duration = ((args.duration as number) ?? 300) * 1000;
            const guild = await client.guilds.fetch(guildId);
            const member = await guild.members.fetch(userId);
            await member.timeout(duration, args.reason as string | undefined);
            return { timed_out: true, duration_seconds: duration / 1000 };
          }
          case "kick": {
            if (!guildId || !userId) return { error: "guild_id and user_id are required" };
            const guild = await client.guilds.fetch(guildId);
            const member = await guild.members.fetch(userId);
            await member.kick(args.reason as string | undefined);
            return { kicked: true };
          }
          case "ban": {
            if (!guildId || !userId) return { error: "guild_id and user_id are required" };
            const guild = await client.guilds.fetch(guildId);
            await guild.members.ban(userId, { reason: args.reason as string | undefined });
            return { banned: true };
          }
          default:
            return { error: `Unknown action: ${action}` };
        }
      } catch (err) {
        return { error: `discord_actions ${action} failed: ${(err as Error).message}` };
      }
    },
  };
}

function createSlackActionsTool(mgr: ChannelManager): AgentTool {
  const ACTIONS = [
    "send_message", "edit_message", "delete_message", "react",
    "read_messages", "pin", "unpin", "member_info", "emoji_list",
  ] as const;

  return {
    name: "slack_actions",
    definition: {
      type: "function",
      function: {
        name: "slack_actions",
        description: [
          "Perform actions on Slack: send/edit/delete messages, react, read history,",
          "pin/unpin messages, get member info, list emoji.",
          "Requires the Slack channel to be connected.",
        ].join(" "),
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: [...ACTIONS], description: "Action to perform" },
            channel_id: { type: "string", description: "Slack channel ID" },
            text: { type: "string", description: "Message text" },
            ts: { type: "string", description: "Message timestamp ID (edit, delete, react, pin, unpin)" },
            thread_ts: { type: "string", description: "Thread timestamp (for threaded replies)" },
            emoji: { type: "string", description: "Emoji name without colons (e.g. thumbsup)" },
            user_id: { type: "string", description: "User ID (member_info)" },
            count: { type: "number", description: "Number of messages to read (default 10, max 50)" },
          },
          required: ["action"],
        },
      },
    },
    execute: async (args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const app = mgr.getChannel("slack")?.getClient() as any;
      if (!app) return notConnected("Slack");

      const action = args.action as string;
      const channelId = args.channel_id as string | undefined;
      const ts = args.ts as string | undefined;
      const text = args.text as string | undefined;

      try {
        switch (action) {
          case "send_message": {
            if (!channelId || !text) return { error: "channel_id and text are required" };
            const result = await app.client.chat.postMessage({
              channel: channelId, text,
              thread_ts: args.thread_ts as string | undefined,
            });
            return { sent: true, ts: result.ts };
          }
          case "edit_message": {
            if (!channelId || !ts || !text) return { error: "channel_id, ts, and text are required" };
            await app.client.chat.update({ channel: channelId, ts, text });
            return { edited: true };
          }
          case "delete_message": {
            if (!channelId || !ts) return { error: "channel_id and ts are required" };
            await app.client.chat.delete({ channel: channelId, ts });
            return { deleted: true };
          }
          case "react": {
            if (!channelId || !ts) return { error: "channel_id and ts are required" };
            const emoji = (args.emoji as string) ?? "thumbsup";
            await app.client.reactions.add({ channel: channelId, timestamp: ts, name: emoji });
            return { reacted: true, emoji };
          }
          case "read_messages": {
            if (!channelId) return { error: "channel_id is required" };
            const count = Math.min(50, Math.max(1, (args.count as number) ?? 10));
            const result = await app.client.conversations.history({ channel: channelId, limit: count });
            const messages = (result.messages ?? []).map((m: { ts: string; text: string; user: string }) => ({
              ts: m.ts, text: m.text, user: m.user,
            }));
            return { messages, count: messages.length };
          }
          case "pin": {
            if (!channelId || !ts) return { error: "channel_id and ts are required" };
            await app.client.pins.add({ channel: channelId, timestamp: ts });
            return { pinned: true };
          }
          case "unpin": {
            if (!channelId || !ts) return { error: "channel_id and ts are required" };
            await app.client.pins.remove({ channel: channelId, timestamp: ts });
            return { unpinned: true };
          }
          case "member_info": {
            const userId = args.user_id as string;
            if (!userId) return { error: "user_id is required" };
            const result = await app.client.users.info({ user: userId });
            const u = result.user;
            return { id: u.id, name: u.name, real_name: u.real_name, display_name: u.profile?.display_name };
          }
          case "emoji_list": {
            const result = await app.client.emoji.list();
            const names = Object.keys(result.emoji ?? {});
            return { emoji: names.slice(0, 100), total: names.length };
          }
          default:
            return { error: `Unknown action: ${action}` };
        }
      } catch (err) {
        return { error: `slack_actions ${action} failed: ${(err as Error).message}` };
      }
    },
  };
}

function createWhatsAppActionsTool(mgr: ChannelManager): AgentTool {
  const ACTIONS = ["send_message", "react"] as const;

  return {
    name: "whatsapp_actions",
    definition: {
      type: "function",
      function: {
        name: "whatsapp_actions",
        description: "Perform actions on WhatsApp: send messages, react to messages. Requires WhatsApp to be connected.",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: [...ACTIONS], description: "Action to perform" },
            jid: { type: "string", description: "WhatsApp JID (phone@s.whatsapp.net or group@g.us)" },
            text: { type: "string", description: "Message text (send_message)" },
            message_id: { type: "string", description: "Message ID (react)" },
            emoji: { type: "string", description: "Emoji for react" },
          },
          required: ["action", "jid"],
        },
      },
    },
    execute: async (args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sock = mgr.getChannel("whatsapp")?.getClient() as any;
      if (!sock) return notConnected("WhatsApp");

      const action = args.action as string;
      const jid = args.jid as string;

      try {
        switch (action) {
          case "send_message": {
            const text = args.text as string;
            if (!text) return { error: "text is required" };
            const sent = await sock.sendMessage(jid, { text });
            return { sent: true, message_id: sent?.key?.id };
          }
          case "react": {
            const messageId = args.message_id as string;
            if (!messageId) return { error: "message_id is required" };
            const emoji = (args.emoji as string) ?? "👍";
            await sock.sendMessage(jid, { react: { text: emoji, key: { remoteJid: jid, id: messageId } } });
            return { reacted: true, emoji };
          }
          default:
            return { error: `Unknown action: ${action}` };
        }
      } catch (err) {
        return { error: `whatsapp_actions ${action} failed: ${(err as Error).message}` };
      }
    },
  };
}

export function createChannelTools(channelManager: ChannelManager): AgentTool[] {
  return [
    createTelegramActionsTool(channelManager),
    createDiscordActionsTool(channelManager),
    createSlackActionsTool(channelManager),
    createWhatsAppActionsTool(channelManager),
  ];
}
