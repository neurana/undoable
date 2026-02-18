import type { ChannelOnboardingAdapter } from "./types.js";
import { applyDmPolicy, dedupeList, inferDmPolicy, parseAllowlist, promptDmPolicy, promptSecretField } from "./helpers.js";

export const telegramAdapter: ChannelOnboardingAdapter = {
  id: "telegram",
  name: "Telegram",
  hint: "Get token from @BotFather",
  async configure({ prompter, existing }) {
    await prompter.note(
      [
        "1) Open Telegram and message @BotFather",
        "2) Run /newbot",
        "3) Copy the bot token",
      ].join("\n"),
      "Telegram setup",
    );

    const token = await promptSecretField({
      prompter,
      label: "Telegram bot token",
      envKey: "TELEGRAM_BOT_TOKEN",
      existingValue: existing?.token,
      placeholder: "123456:ABC...",
    });

    const policy = await promptDmPolicy(prompter, inferDmPolicy(existing));
    let allowlist = Array.isArray(existing?.userAllowlist) ? existing!.userAllowlist! : [];
    if (policy === "allowlist") {
      const raw = await prompter.text({
        message: "Telegram allowlist (user IDs or usernames, comma separated)",
        initialValue: allowlist.join(", "),
        placeholder: "123456789, @username",
        validate: (value) => (parseAllowlist(value).length > 0 ? undefined : "At least one entry is required"),
      });
      allowlist = dedupeList(parseAllowlist(raw));
    }

    return applyDmPolicy(
      {
        channelId: "telegram",
        enabled: true,
        token,
        extra: { ...(existing?.extra ?? {}) },
      },
      policy,
      allowlist,
    );
  },
};
