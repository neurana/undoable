import { discordAdapter } from "./discord.js";
import { slackAdapter } from "./slack.js";
import { telegramAdapter } from "./telegram.js";
import { whatsappAdapter } from "./whatsapp.js";
import type { ChannelId, ChannelOnboardingAdapter } from "./types.js";

const ADAPTERS: ChannelOnboardingAdapter[] = [
  telegramAdapter,
  discordAdapter,
  slackAdapter,
  whatsappAdapter,
];

export function listChannelOnboardingAdapters(): ChannelOnboardingAdapter[] {
  return [...ADAPTERS];
}

export function getChannelOnboardingAdapter(channelId: ChannelId): ChannelOnboardingAdapter {
  const adapter = ADAPTERS.find((entry) => entry.id === channelId);
  if (!adapter) throw new Error(`Unknown channel adapter: ${channelId}`);
  return adapter;
}

export type { ChannelId, DmPolicy, ChannelOnboardingAdapter, ChannelOnboardingConfig } from "./types.js";
