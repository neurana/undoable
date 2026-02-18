import type { ChannelOnboardingAdapter } from "./types.js";
import { applyDmPolicy, dedupeList, inferDmPolicy, parseAllowlist, promptDmPolicy, promptSecretField } from "./helpers.js";

export const slackAdapter: ChannelOnboardingAdapter = {
  id: "slack",
  name: "Slack",
  hint: "Socket Mode with xoxb + xapp tokens",
  async configure({ prompter, existing }) {
    await prompter.note(
      [
        "1) api.slack.com/apps → Create app",
        "2) Enable Socket Mode and generate app token (xapp-...)",
        "3) Install app and copy bot token (xoxb-...)",
        "4) Required scopes: chat:write, users:read, im:history, channels:history",
      ].join("\n"),
      "Slack setup",
    );

    const token = await promptSecretField({
      prompter,
      label: "Slack bot token",
      envKey: "SLACK_BOT_TOKEN",
      existingValue: existing?.token,
      placeholder: "xoxb-...",
    });

    const currentAppToken = typeof existing?.extra?.appToken === "string" ? existing.extra.appToken : undefined;
    const appToken = await promptSecretField({
      prompter,
      label: "Slack app-level token",
      envKey: "SLACK_APP_TOKEN",
      existingValue: currentAppToken,
      placeholder: "xapp-...",
    });

    const policy = await promptDmPolicy(prompter, inferDmPolicy(existing));
    let allowlist = Array.isArray(existing?.userAllowlist) ? existing!.userAllowlist! : [];
    if (policy === "allowlist") {
      const raw = await prompter.text({
        message: "Slack allowlist (user IDs, comma separated)",
        initialValue: allowlist.join(", "),
        placeholder: "U1234567890",
        validate: (value) => (parseAllowlist(value).length > 0 ? undefined : "At least one entry is required"),
      });
      allowlist = dedupeList(parseAllowlist(raw));
    }

    return applyDmPolicy(
      {
        channelId: "slack",
        enabled: true,
        token,
        extra: { ...(existing?.extra ?? {}), appToken },
      },
      policy,
      allowlist,
    );
  },
};
