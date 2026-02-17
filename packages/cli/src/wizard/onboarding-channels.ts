import * as fs from "node:fs";
import type { WizardPrompter } from "./prompts.js";
import { ensureUndoableDir, CHANNELS_FILE } from "./onboarding-helpers.js";

type ChannelDef = {
  id: string;
  name: string;
  hint: string;
  fields: ChannelField[];
};

type ChannelField = {
  key: string;
  label: string;
  env: string;
  placeholder?: string;
};

const CHANNELS: ChannelDef[] = [
  {
    id: "telegram",
    name: "Telegram",
    hint: "Get token from @BotFather",
    fields: [
      { key: "token", label: "Bot token", env: "TELEGRAM_BOT_TOKEN", placeholder: "123456:ABC-DEF..." },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    hint: "Discord Developer Portal bot token",
    fields: [
      { key: "token", label: "Bot token", env: "DISCORD_BOT_TOKEN" },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    hint: "Slack API bot token (xoxb-...)",
    fields: [
      { key: "token", label: "Bot token", env: "SLACK_BOT_TOKEN", placeholder: "xoxb-..." },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    hint: "Meta Cloud API credentials",
    fields: [
      { key: "extra.phoneId", label: "Phone ID", env: "WHATSAPP_PHONE_ID" },
      { key: "token", label: "API token", env: "WHATSAPP_TOKEN" },
    ],
  },
];

type ChannelConfig = {
  channelId: string;
  enabled: boolean;
  token?: string;
  extra?: Record<string, unknown>;
};

export async function setupChannels(prompter: WizardPrompter): Promise<ChannelConfig[]> {
  const shouldConfigure = await prompter.confirm({
    message: "Configure messaging channels? (Telegram, Discord, Slack, WhatsApp)",
    initialValue: false,
  });

  if (!shouldConfigure) return [];

  const selected = await prompter.multiselect<string>({
    message: "Select channels to configure",
    options: CHANNELS.map((ch) => ({
      value: ch.id,
      label: ch.name,
      hint: ch.hint,
    })),
  });

  const configs: ChannelConfig[] = [];

  for (const channelId of selected) {
    const channel = CHANNELS.find((ch) => ch.id === channelId)!;
    await prompter.note(`Configure ${channel.name}`, channel.name);

    const config: ChannelConfig = {
      channelId,
      enabled: true,
    };

    for (const field of channel.fields) {
      const existingEnv = process.env[field.env] ?? "";
      let value = "";

      if (existingEnv) {
        const masked = `${existingEnv.slice(0, 6)}...${existingEnv.slice(-4)}`;
        const useExisting = await prompter.confirm({
          message: `Found ${field.env} (${masked}). Use it?`,
          initialValue: true,
        });
        if (useExisting) {
          value = existingEnv;
        }
      }

      if (!value) {
        value = await prompter.text({
          message: field.label,
          placeholder: field.placeholder,
          validate: (v) => (v.trim() ? undefined : `${field.label} is required`),
        });
      }

      if (field.key === "token") {
        config.token = value;
      } else if (field.key.startsWith("extra.")) {
        const extraKey = field.key.slice(6);
        config.extra = { ...config.extra, [extraKey]: value };
      }
    }

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
