import type { WizardPrompter } from "./prompts.js";
import { WizardCancelledError } from "./prompts.js";
import {
  DEFAULT_PORT,
  DEFAULT_WORKSPACE,
  ensureUndoableDir,
  ensureWorkspace,
  handleReset,
  printWizardHeader,
  readConfigSnapshot,
  shortenHome,
  summarizeExistingConfig,
  writeConfigFile,
  writeProfileFiles,
  type OnboardConfig,
} from "./onboarding-helpers.js";
import { setupProviders } from "./onboarding-providers.js";
import { setupChannels } from "./onboarding-channels.js";
import { setupSkills } from "./onboarding-skills.js";

export type OnboardOptions = {
  flow?: string;
  workspace?: string;
  acceptRisk?: boolean;
  reset?: boolean;
  nonInteractive?: boolean;
};

type WizardFlow = "quickstart" | "advanced";

async function requireRiskAcknowledgement(
  prompter: WizardPrompter,
  opts: OnboardOptions,
) {
  if (opts.acceptRisk) return;

  await prompter.note(
    [
      "Security warning — please read.",
      "",
      "Undoable is an AI agent framework that can execute code,",
      "read/write files, and make network requests on your system.",
      "",
      "A bad prompt can trick agents into doing unsafe things.",
      "If you're not comfortable with basic security and access control,",
      "don't run Undoable with tools enabled on untrusted inputs.",
      "",
      "Recommended baseline:",
      "- Use approval gates for dangerous operations.",
      "- Run in sandbox mode when possible.",
      "- Keep secrets out of the agent's reachable filesystem.",
      "- Use the strongest available model for agents with tools.",
    ].join("\n"),
    "Security",
  );

  const ok = await prompter.confirm({
    message: "I understand this is powerful and inherently risky. Continue?",
    initialValue: false,
  });

  if (!ok) {
    throw new WizardCancelledError("risk not accepted");
  }
}

export async function runOnboardingWizard(
  opts: OnboardOptions,
  prompter: WizardPrompter,
) {
  printWizardHeader();
  await prompter.intro("Undoable onboarding");
  ensureUndoableDir();

  await requireRiskAcknowledgement(prompter, opts);

  const snapshot = readConfigSnapshot();
  let baseConfig: OnboardConfig = snapshot.valid ? snapshot.config : {};

  if (snapshot.exists && !snapshot.valid) {
    await prompter.note(
      "Your config file is invalid or corrupted.\nRun `nrn doctor` to diagnose, then re-run onboarding.",
      "Invalid config",
    );
    process.exit(1);
  }

  const normalizedFlow = opts.flow === "manual" ? "advanced" : opts.flow;
  const flow: WizardFlow =
    normalizedFlow === "quickstart" || normalizedFlow === "advanced"
      ? normalizedFlow
      : await prompter.select<WizardFlow>({
          message: "Onboarding mode",
          options: [
            {
              value: "quickstart",
              label: "QuickStart",
              hint: "Configure details later with nrn config",
            },
            {
              value: "advanced",
              label: "Manual",
              hint: "Configure port, channels, skills, and more",
            },
          ],
          initialValue: "quickstart",
        });

  if (snapshot.exists && snapshot.valid && Object.keys(baseConfig).length > 0) {
    await prompter.note(
      summarizeExistingConfig(baseConfig),
      "Existing config detected",
    );

    const action = await prompter.select<string>({
      message: "Config handling",
      options: [
        { value: "keep", label: "Use existing values" },
        { value: "modify", label: "Update values" },
        { value: "reset", label: "Reset" },
      ],
    });

    if (action === "reset") {
      const scope = await prompter.select<"config" | "config+creds" | "full">({
        message: "Reset scope",
        options: [
          { value: "config", label: "Config only" },
          { value: "config+creds", label: "Config + credentials + profiles" },
          { value: "full", label: "Full reset (config + creds + workspace)" },
        ],
      });
      handleReset(scope);
      baseConfig = {};
    }
  }

  if (opts.reset) {
    handleReset("full");
    baseConfig = {};
  }

  const existingAgents = baseConfig.agents as
    | Record<string, unknown>
    | undefined;
  const existingDefault = existingAgents?.default as
    | Record<string, unknown>
    | undefined;
  const existingWorkspace =
    (existingDefault?.workspace as string) ?? DEFAULT_WORKSPACE;

  const workspace =
    opts.workspace?.trim() ||
    (flow === "quickstart"
      ? existingWorkspace
      : await prompter.text({
          message: "Workspace directory",
          initialValue: existingWorkspace,
        }));

  ensureWorkspace(workspace);

  const providerSelection = await setupProviders(prompter);

  let channelConfigs: unknown[] = [];
  let enabledSkills: string[] = [];

  if (flow === "advanced") {
    channelConfigs = await setupChannels(prompter);
    enabledSkills = await setupSkills(prompter);
  } else {
    enabledSkills = ["github", "web-search"];
  }

  const timezoneDefault =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  let userName = process.env.USER || "User";
  let botName = "Undoable";
  let timezone = timezoneDefault;
  let personality =
    "You are a helpful, concise, and friendly AI assistant with access to powerful tools.";
  let instructions = "Personal AI assistant";

  if (flow === "advanced") {
    userName = await prompter.text({
      message: "Your name",
      initialValue: userName,
    });
    botName = await prompter.text({
      message: "Assistant name",
      initialValue: botName,
    });
    timezone = await prompter.text({
      message: "Timezone",
      initialValue: timezone,
    });
    personality = await prompter.text({
      message: "Assistant personality",
      initialValue: personality,
    });
    instructions = await prompter.text({
      message: "Assistant instructions",
      initialValue: instructions,
    });
  }

  writeProfileFiles({ userName, botName, timezone, personality, instructions });

  const nextConfig: OnboardConfig = {
    ...baseConfig,
    agents: {
      ...(baseConfig.agents as Record<string, unknown> | undefined),
      default: {
        ...(existingDefault ?? {}),
        default: true,
        workspace,
        mode: "local",
      },
    },
    daemon: {
      ...(baseConfig.daemon as Record<string, unknown> | undefined),
      port: DEFAULT_PORT,
    },
    wizard: {
      lastRunAt: new Date().toISOString(),
      lastRunCommand: "onboard",
      lastRunFlow: flow,
    },
  };

  writeConfigFile(nextConfig);

  await prompter.note(
    [
      `Workspace: ${shortenHome(workspace)}`,
      ...(providerSelection
        ? [
            `Provider: ${providerSelection.providerName}`,
            `Model: ${providerSelection.modelName}`,
          ]
        : ["Provider: not configured"]),
      `Channels: ${channelConfigs.length > 0 ? channelConfigs.length + " configured" : "none"}`,
      `Skills: ${enabledSkills.length > 0 ? enabledSkills.join(", ") : "none"}`,
      `Profile: ${userName} / ${botName}`,
    ].join("\n"),
    "Summary",
  );

  const startNow = await prompter.confirm({
    message: "Start Undoable now? (nrn start)",
    initialValue: true,
  });

  if (startNow) {
    await prompter.note(
      [
        `Run: nrn start`,
        `Dashboard: http://127.0.0.1:${DEFAULT_PORT}`,
        "",
        "The dashboard opens in your browser.",
        "Use it to chat, manage agents, and monitor SWARM workflows.",
      ].join("\n"),
      "Getting started",
    );
  } else {
    await prompter.note(`When you're ready: nrn start`, "Later");
  }

  await prompter.note(
    "Running AI agents on your computer is risky. Use sandbox mode and approval gates for sensitive operations.",
    "Security reminder",
  );

  await prompter.outro(
    "Onboarding complete. Run `nrn start` to launch Undoable.",
  );
}
