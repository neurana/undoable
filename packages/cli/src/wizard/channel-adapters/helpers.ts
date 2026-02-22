import type { WizardPrompter } from "../prompts.js";
import type { ChannelOnboardingConfig, DmPolicy } from "./types.js";

export function maskSecret(value: string): string {
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function parseAllowlist(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function dedupeList(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

export function inferDmPolicy(config?: ChannelOnboardingConfig): DmPolicy {
  if (!config) return "pairing";
  const fromExtra = typeof config.extra?.dmPolicy === "string"
    ? config.extra.dmPolicy.trim().toLowerCase()
    : "";
  if (fromExtra === "pairing" || fromExtra === "allowlist" || fromExtra === "open" || fromExtra === "disabled") {
    return fromExtra;
  }
  if (config.allowDMs === false) return "disabled";
  if (Array.isArray(config.userAllowlist) && config.userAllowlist.length > 0) return "allowlist";
  return "pairing";
}

export async function promptDmPolicy(prompter: WizardPrompter, initial: DmPolicy): Promise<DmPolicy> {
  return prompter.select<DmPolicy>({
    message: "DM policy",
    options: [
      { value: "pairing", label: "Default (recommended)", hint: "Require one-time pairing approval for new DM users" },
      { value: "allowlist", label: "Allowlist only", hint: "Only listed users can message" },
      { value: "open", label: "Open", hint: "Allow anyone to DM" },
      { value: "disabled", label: "Disabled", hint: "Ignore direct messages" },
    ],
    initialValue: initial,
  });
}

export function applyDmPolicy(
  base: ChannelOnboardingConfig,
  dmPolicy: DmPolicy,
  allowlist: string[],
): ChannelOnboardingConfig {
  const extra = { ...base.extra, dmPolicy, allowlist };
  return {
    ...base,
    extra,
    allowDMs: dmPolicy !== "disabled",
    allowGroups: base.allowGroups ?? true,
    userAllowlist: dmPolicy === "allowlist" ? allowlist : [],
  };
}

export async function promptSecretField(params: {
  prompter: WizardPrompter;
  label: string;
  envKey?: string;
  existingValue?: string;
  placeholder?: string;
  required?: boolean;
}): Promise<string> {
  const { prompter, label, envKey, existingValue, placeholder, required = true } = params;
  const envValue = envKey ? process.env[envKey]?.trim() : undefined;

  if (envValue) {
    const useEnv = await prompter.confirm({
      message: `Use ${envKey} (${maskSecret(envValue)}) for ${label}?`,
      initialValue: true,
    });
    if (useEnv) return envValue;
  }

  if (existingValue?.trim()) {
    const useExisting = await prompter.confirm({
      message: `Keep existing ${label} (${maskSecret(existingValue.trim())})?`,
      initialValue: true,
    });
    if (useExisting) return existingValue.trim();
  }

  const value = await prompter.text({
    message: label,
    placeholder,
    validate: (input) => {
      if (!required) return undefined;
      return input.trim() ? undefined : `${label} is required`;
    },
  });
  return value.trim();
}
