import type { ChannelOnboardingAdapter } from "./types.js";
import { applyDmPolicy, dedupeList, inferDmPolicy, parseAllowlist, promptDmPolicy } from "./helpers.js";

export const whatsappAdapter: ChannelOnboardingAdapter = {
  id: "whatsapp",
  name: "WhatsApp",
  hint: "QR login (no token required)",
  async configure({ prompter, existing }) {
    await prompter.note(
      [
        "WhatsApp in Undoable uses QR login.",
        "After setup, run: nrn channels login --channel whatsapp",
        "Then scan the QR using WhatsApp Linked Devices.",
      ].join("\n"),
      "WhatsApp setup",
    );

    const policy = await promptDmPolicy(prompter, inferDmPolicy(existing));
    let allowlist = Array.isArray(existing?.userAllowlist) ? existing!.userAllowlist! : [];
    if (policy === "allowlist") {
      const raw = await prompter.text({
        message: "WhatsApp allowlist (E.164 numbers, comma separated)",
        initialValue: allowlist.join(", "),
        placeholder: "+15555550123, +447700900123",
        validate: (value) => (parseAllowlist(value).length > 0 ? undefined : "At least one entry is required"),
      });
      allowlist = dedupeList(parseAllowlist(raw));
    }

    return applyDmPolicy(
      {
        channelId: "whatsapp",
        enabled: true,
        extra: { ...existing?.extra },
      },
      policy,
      allowlist,
    );
  },
};
