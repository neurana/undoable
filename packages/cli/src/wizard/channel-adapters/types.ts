import type { WizardPrompter } from "../prompts.js";

export type ChannelId = "telegram" | "discord" | "slack" | "whatsapp";
export type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";

export type ChannelOnboardingConfig = {
  channelId: ChannelId;
  enabled: boolean;
  token?: string;
  extra?: Record<string, unknown>;
  allowDMs?: boolean;
  allowGroups?: boolean;
  userAllowlist?: string[];
  userBlocklist?: string[];
  rateLimit?: number;
  maxMediaBytes?: number;
};

export type ChannelOnboardingAdapterContext = {
  prompter: WizardPrompter;
  existing?: ChannelOnboardingConfig;
};

export type ChannelOnboardingAdapter = {
  id: ChannelId;
  name: string;
  hint: string;
  configure(ctx: ChannelOnboardingAdapterContext): Promise<ChannelOnboardingConfig>;
};
