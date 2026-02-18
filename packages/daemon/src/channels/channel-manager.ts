import * as fsp from "node:fs/promises";
import * as path from "node:path";
import os from "node:os";
import type { EventBus } from "@undoable/core";
import type { ChatService } from "../services/chat-service.js";
import type { ToolRegistry } from "../tools/index.js";
import type { CallLLMFn } from "../services/run-executor.js";
import type { MediaService } from "../services/media-service.js";
import type { MediaUnderstandingService } from "../services/media-understanding.js";
import type { Channel, ChannelConfig, ChannelId, ChannelMessage, ChannelStatus } from "./types.js";
import { RateLimiter, shouldAcceptMessage, isMediaWithinLimit, MessageQueue } from "./channel-utils.js";
import { parseDirectives } from "../services/directive-parser.js";

const CONFIG_PATH = path.join(os.homedir(), ".undoable", "channels.json");

const CHANNEL_SYSTEM_PROMPT = [
  "You are Undoable, an AI assistant responding via a messaging channel.",
  "Keep responses concise and conversational — this is a chat platform, not a code editor.",
  "Format responses as plain text (no markdown) unless the platform supports it.",
  "",
  "You have full access to the user's system via tools:",
  "- web_search: Search the web. Use this when asked to find, research, or look up anything.",
  "- browse_page / web_fetch: Read a specific URL or make HTTP requests.",
  "- browser: Full browser control (navigate, click, type, screenshot, etc.).",
  "- exec: Run shell commands on the user's system.",
  "- read_file / write_file / edit_file: File operations.",
  "- project_info / file_info / codebase_search: Understand codebases.",
  "- skills_list / skills_search / skills_install / skills_remove / skills_toggle: Discover and manage skills.sh skills from inside Undoable.",
  "- telegram_actions / discord_actions / slack_actions / whatsapp_actions: Perform actions on messaging platforms.",
  "- sessions_list / sessions_history / sessions_send / sessions_spawn: Interact with other sessions.",
  "- media: Download, inspect, resize, describe (image→text), transcribe (audio→text) media files.",
  "",
  "Automation policy:",
  "- For requests like automation/workflow/SDR/24-7 agent, propose or execute an Undoable-native workflow first.",
  "- Do not default to external services (Zapier/Make/n8n) unless the user explicitly asks for those.",
  "- If a platform has no dedicated tool (for example email/Gmail), implement via exec/web_fetch inside Undoable and ask only for missing credentials.",
  "",
  "Act immediately when asked. Do not ask clarifying questions unless truly ambiguous.",
].join("\n");

export type ChannelManagerDeps = {
  chatService: ChatService;
  eventBus: EventBus;
  callLLM: CallLLMFn;
  registry: ToolRegistry;
  mediaService?: MediaService;
  mediaUnderstanding?: MediaUnderstandingService;
};

export class ChannelManager {
  private channels = new Map<ChannelId, Channel>();
  private configs = new Map<ChannelId, ChannelConfig>();
  private deps: ChannelManagerDeps;
  private rateLimiters = new Map<ChannelId, RateLimiter>();
  private messageQueue: MessageQueue;

  constructor(deps: ChannelManagerDeps) {
    this.deps = deps;
    this.messageQueue = new MessageQueue((msg) => this.processInbound(msg), { debounceMs: 300 });
  }

  private getRateLimiter(channelId: ChannelId): RateLimiter {
    let rl = this.rateLimiters.get(channelId);
    if (!rl) {
      const config = this.configs.get(channelId);
      rl = new RateLimiter({ maxPerMinute: config?.rateLimit ?? 20 });
      this.rateLimiters.set(channelId, rl);
    }
    return rl;
  }

  register(channel: Channel): void {
    this.channels.set(channel.id, channel);
  }

  getChannel(id: ChannelId): Channel | undefined {
    return this.channels.get(id);
  }

  async loadConfigs(): Promise<void> {
    try {
      const raw = await fsp.readFile(CONFIG_PATH, "utf-8");
      const configs = JSON.parse(raw) as ChannelConfig[];
      for (const c of configs) this.configs.set(c.channelId, c);
    } catch {
      // No config file yet
    }
  }

  private async saveConfigs(): Promise<void> {
    await fsp.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    const arr = Array.from(this.configs.values());
    await fsp.writeFile(CONFIG_PATH, JSON.stringify(arr, null, 2), "utf-8");
  }

  getConfig(channelId: ChannelId): ChannelConfig | undefined {
    return this.configs.get(channelId);
  }

  async updateConfig(channelId: ChannelId, patch: Partial<ChannelConfig>): Promise<ChannelConfig> {
    const existing = this.configs.get(channelId) ?? { channelId, enabled: false };
    const updated = { ...existing, ...patch, channelId };
    this.configs.set(channelId, updated);
    await this.saveConfigs();
    return updated;
  }

  listAll(): Array<{ config: ChannelConfig; status: ChannelStatus }> {
    const result: Array<{ config: ChannelConfig; status: ChannelStatus }> = [];
    for (const [id, channel] of this.channels) {
      const config = this.configs.get(id) ?? { channelId: id, enabled: false };
      result.push({ config, status: channel.status() });
    }
    return result;
  }

  getStatus(channelId: ChannelId): { config: ChannelConfig; status: ChannelStatus } | undefined {
    const channel = this.channels.get(channelId);
    if (!channel) return undefined;
    const config = this.configs.get(channelId) ?? { channelId, enabled: false };
    return { config, status: channel.status() };
  }

  async startChannel(channelId: ChannelId): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error(`Unknown channel: ${channelId}`);
    const config = this.configs.get(channelId);
    if (!config) throw new Error(`No config for channel: ${channelId}`);

    await channel.start(config, (msg) => this.handleInbound(msg));
    config.enabled = true;
    await this.saveConfigs();
  }

  async stopChannel(channelId: ChannelId): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error(`Unknown channel: ${channelId}`);
    await channel.stop();
  }

  async startAll(): Promise<void> {
    await this.loadConfigs();
    for (const [id, config] of this.configs) {
      if (!config.enabled || !config.token) continue;
      const channel = this.channels.get(id);
      if (!channel) continue;
      try {
        await channel.start(config, (msg) => this.handleInbound(msg));
      } catch {
        // Will show error via status
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      try {
        await channel.stop();
      } catch {
        // Best effort
      }
    }
  }

  private handleInbound(msg: ChannelMessage): void {
    const config = this.configs.get(msg.channelId);

    if (!shouldAcceptMessage(msg, {
      allowDMs: config?.allowDMs ?? true,
      allowGroups: config?.allowGroups ?? true,
      userAllowlist: config?.userAllowlist,
      userBlocklist: config?.userBlocklist,
    })) return;

    if (msg.mediaUrl) {
      const maxBytes = config?.maxMediaBytes ?? 10 * 1024 * 1024;
      if (!isMediaWithinLimit(0, maxBytes)) return;
    }

    const rl = this.getRateLimiter(msg.channelId);
    if (!rl.allow(msg.from)) return;

    this.messageQueue.enqueue(msg);
  }

  private async processInbound(msg: ChannelMessage): Promise<void> {
    const sessionId = `channel-${msg.channelId}-${msg.to}`;

    this.deps.eventBus.emit(sessionId, "CHANNEL_MESSAGE_IN" as never, { message: msg });

    try {
      await this.deps.chatService.getOrCreate(sessionId, { systemPrompt: CHANNEL_SYSTEM_PROMPT });

      // Parse inline directives from channel messages
      const { directives, cleanMessage } = parseDirectives(msg.text);
      for (const d of directives) {
        if (d.type === "reset") {
          await this.deps.chatService.resetSession(sessionId);
          const channel = this.channels.get(msg.channelId);
          if (channel) await channel.send(msg.to, "Session reset.", { threadId: msg.threadId });
          return;
        }
      }

      let userText = cleanMessage || msg.text;
      if (msg.mediaUrl && this.deps.mediaService) {
        try {
          const stored = await this.deps.mediaService.download(msg.mediaUrl);
          userText += `\n[Media downloaded: ${stored.contentType}, ${stored.size} bytes, saved to ${stored.filePath}]`;

          if (this.deps.mediaUnderstanding) {
            try {
              if (this.deps.mediaUnderstanding.isImage(stored.filePath)) {
                const { description } = await this.deps.mediaUnderstanding.describeImage(stored.filePath);
                userText += `\n[Image description: ${description}]`;
              } else if (this.deps.mediaUnderstanding.isAudio(stored.filePath)) {
                const { text } = await this.deps.mediaUnderstanding.transcribeAudio(stored.filePath);
                userText += `\n[Audio transcription: ${text}]`;
              }
            } catch {
              // Media understanding failed — continue with basic info
            }
          }
        } catch {
          userText += `\n[Media download failed for: ${msg.mediaUrl}]`;
        }
      }

      await this.deps.chatService.addUserMessage(sessionId, userText);

      const messages = await this.deps.chatService.buildApiMessages(sessionId);
      const response = await this.deps.callLLM(messages, this.deps.registry.definitions, false);

      let replyText: string;
      if (response instanceof Response) {
        const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        replyText = json.choices?.[0]?.message?.content ?? "I couldn't generate a response.";
      } else {
        replyText = response.content ?? "I couldn't generate a response.";
      }

      await this.deps.chatService.addAssistantMessage(sessionId, replyText);

      const channel = this.channels.get(msg.channelId);
      if (channel) {
        await channel.send(msg.to, replyText, { threadId: msg.threadId });
      }

      this.deps.eventBus.emit(sessionId, "CHANNEL_MESSAGE_OUT" as never, {
        channelId: msg.channelId,
        to: msg.to,
        text: replyText,
      });
    } catch (err) {
      const channel = this.channels.get(msg.channelId);
      if (channel) {
        try {
          await channel.send(msg.to, `Sorry, I encountered an error: ${(err as Error).message}`, { threadId: msg.threadId });
        } catch { }
      }
    }
  }
}
