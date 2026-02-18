import * as fs from "node:fs";
import type { WizardPrompter } from "./prompts.js";
import { ensureUndoableDir, CHANNELS_FILE } from "./onboarding-helpers.js";
import {
  getChannelOnboardingAdapter,
  listChannelOnboardingAdapters,
  type ChannelId,
  type ChannelOnboardingConfig,
} from "./channel-adapters/index.js";

type ChannelConfig = ChannelOnboardingConfig;

function readExistingConfigs(): Partial<Record<ChannelId, ChannelConfig>> {
  try {
    const raw = fs.readFileSync(CHANNELS_FILE, "utf-8").trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ChannelConfig[];
    const out: Partial<Record<ChannelId, ChannelConfig>> = {};
    for (const row of parsed) {
      if (!row?.channelId) continue;
      const channelId = String(row.channelId).trim().toLowerCase() as ChannelId;
      out[channelId] = row;
    }
    return out;
  } catch {
    return {};
  }
}

export async function setupChannels(prompter: WizardPrompter): Promise<ChannelConfig[]> {
  const adapters = listChannelOnboardingAdapters();
  const shouldConfigure = await prompter.confirm({
    message: "Configure messaging channels? (Telegram, Discord, Slack, WhatsApp)",
    initialValue: false,
  });
  if (!shouldConfigure) return [];

  const selected = await prompter.multiselect<ChannelId>({
    message: "Select channels to configure",
    options: adapters.map((adapter) => ({
      value: adapter.id,
      label: adapter.name,
      hint: adapter.hint,
    })),
  });

  const existingById = readExistingConfigs();
  const configs: ChannelConfig[] = [];

  for (const channelId of selected) {
    const adapter = getChannelOnboardingAdapter(channelId);
    await prompter.note(`Configure ${adapter.name}`, adapter.name);
    const config = await adapter.configure({
      prompter,
      existing: existingById[channelId],
    });
    configs.push(config);
  }

  if (configs.length > 0) {
    writeChannelsConfig(configs);
  }

  return configs;
}

function writeChannelsConfig(configs: ChannelConfig[]) {
  ensureUndoableDir();
  fs.writeFileSync(CHANNELS_FILE, `${JSON.stringify(configs, null, 2)}\n`, "utf-8");
}
