import type { ChannelOnboardingAdapter } from "./types.js";
import { applyDmPolicy, dedupeList, inferDmPolicy, parseAllowlist, promptDmPolicy, promptSecretField } from "./helpers.js";

export const discordAdapter: ChannelOnboardingAdapter = {
  id: "discord",
  name: "Discord",
  hint: "Discord Developer Portal bot token",
  async configure({ prompter, existing }) {
    await prompter.note(
      [
        "1) discord.com/developers/applications",
        "2) Create app → Bot → Reset token",
        "3) Enable Message Content Intent",
        "4) Invite bot to your server with bot scope",
      ].join("\n"),
      "Discord setup",
    );

    const token = await promptSecretField({
      prompter,
      label: "Discord bot token",
      envKey: "DISCORD_BOT_TOKEN",
      existingValue: existing?.token,
    });

    const policy = await promptDmPolicy(prompter, inferDmPolicy(existing));
    let allowlist = Array.isArray(existing?.userAllowlist) ? existing!.userAllowlist! : [];
    if (policy === "allowlist") {
      const raw = await prompter.text({
        message: "Discord allowlist (user IDs, comma separated)",
        initialValue: allowlist.join(", "),
        placeholder: "123456789012345678",
        validate: (value) => (parseAllowlist(value).length > 0 ? undefined : "At least one entry is required"),
      });
      allowlist = dedupeList(parseAllowlist(raw));
    }

    return applyDmPolicy(
      {
        channelId: "discord",
        enabled: true,
        token,
        extra: { ...existing?.extra },
      },
      policy,
      allowlist,
    );
  },
};
