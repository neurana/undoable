import { Command } from "commander";
import { daemonRequest } from "./daemon-client.js";

type RunConfigResponse = {
  mode?: string;
  maxIterations?: number;
  configuredMaxIterations?: number;
  approvalMode?: string;
  dangerouslySkipPermissions?: boolean;
  thinking?: string;
  reasoningVisibility?: string;
  model?: string;
  provider?: string;
  canThink?: boolean;
  economyMode?: boolean;
  allowIrreversibleActions?: boolean;
  undoGuaranteeEnabled?: boolean;
  economy?: {
    maxIterationsCap?: number;
    toolResultMaxChars?: number;
    contextMaxTokens?: number;
    contextThreshold?: number;
  };
  spendGuard?: {
    dailyBudgetUsd?: number | null;
    spentLast24hUsd?: number;
    remainingUsd?: number | null;
    exceeded?: boolean;
    autoPauseOnLimit?: boolean;
    paused?: boolean;
  };
};

type ApprovalModeResponse = {
  mode: "off" | "mutate" | "always";
  dangerouslySkipPermissions?: boolean;
};

type ThinkingResponse = {
  level: "off" | "low" | "medium" | "high";
  visibility: "off" | "on" | "stream";
  canThink?: boolean;
  economyMode?: boolean;
};

type SettingsSnapshot = {
  run: RunConfigResponse;
  approval: ApprovalModeResponse | null;
  thinking: ThinkingResponse | null;
};

type DaemonSettingsRecord = {
  host: string;
  port: number;
  bindMode: "loopback" | "all" | "custom";
  authMode: "open" | "token";
  token: string;
  securityPolicy: "strict" | "balanced" | "permissive";
  updatedAt: string;
};

type DaemonSettingsSnapshot = {
  settingsFile: string;
  desired: DaemonSettingsRecord;
  effective: {
    host: string;
    port: number;
    bindMode: "loopback" | "all" | "custom";
    authMode: "open" | "token";
    tokenSet: boolean;
    securityPolicy: "strict" | "balanced" | "permissive";
  };
  restartRequired: boolean;
};

const RUN_MODES = ["interactive", "autonomous", "supervised"] as const;
const APPROVAL_MODES = ["off", "mutate", "always"] as const;
const THINKING_LEVELS = ["off", "low", "medium", "high"] as const;
const REASONING_VISIBILITY = ["off", "on", "stream"] as const;
const DAEMON_BIND_MODES = ["loopback", "all", "custom"] as const;
const DAEMON_AUTH_MODES = ["open", "token"] as const;
const DAEMON_SECURITY_POLICIES = ["strict", "balanced", "permissive"] as const;

function parseOnOff(raw: string | undefined, field: string): boolean | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "on" || normalized === "true") return true;
  if (normalized === "off" || normalized === "false") return false;
  throw new Error(`${field} must be on/off`);
}

function parseBudget(raw: string | undefined): number | null | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0 || normalized === "off" || normalized === "none") {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("budget must be a positive USD number, or 'off'");
  }
  return parsed;
}

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `$${value.toFixed(2)}`;
}

function parseEnumValue<T extends readonly string[]>(
  raw: string | undefined,
  field: string,
  values: T,
): T[number] | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if ((values as readonly string[]).includes(normalized)) {
    return normalized as T[number];
  }
  throw new Error(`${field} must be one of: ${values.join(", ")}`);
}

async function fetchSnapshot(url?: string, token?: string): Promise<SettingsSnapshot> {
  const [run, approval, thinking] = await Promise.all([
    daemonRequest<RunConfigResponse>("/chat/run-config", { url, token }),
    daemonRequest<ApprovalModeResponse>("/chat/approval-mode", { url, token }).catch(() => null),
    daemonRequest<ThinkingResponse>("/chat/thinking", { url, token }).catch(() => null),
  ]);
  return { run, approval, thinking };
}

async function fetchDaemonSnapshot(url?: string, token?: string): Promise<DaemonSettingsSnapshot> {
  return daemonRequest<DaemonSettingsSnapshot>("/settings/daemon", { url, token });
}

function printSnapshot(snapshot: SettingsSnapshot): void {
  const run = snapshot.run;
  const spend = run.spendGuard;
  console.log("Runtime");
  console.log(`  Mode: ${run.mode ?? "-"}`);
  console.log(`  Provider/Model: ${run.provider ?? "-"} / ${run.model ?? "-"}`);
  console.log(`  Approval: ${snapshot.approval?.mode ?? run.approvalMode ?? "-"}`);
  console.log(`  Max iterations: ${run.maxIterations ?? "-"}${typeof run.configuredMaxIterations === "number" ? ` (configured ${run.configuredMaxIterations})` : ""}`);
  console.log(`  Economy: ${run.economyMode ? "on" : "off"}`);
  console.log(`  Undo guarantee: ${run.allowIrreversibleActions === true ? "open" : "strict"}`);
  if (typeof run.dangerouslySkipPermissions === "boolean") {
    console.log(`  Skip permissions: ${run.dangerouslySkipPermissions ? "on" : "off"}`);
  }

  console.log("Thinking");
  console.log(`  Level: ${snapshot.thinking?.level ?? run.thinking ?? "-"}`);
  console.log(`  Visibility: ${snapshot.thinking?.visibility ?? run.reasoningVisibility ?? "-"}`);
  console.log(`  Available now: ${(snapshot.thinking?.canThink ?? run.canThink) ? "yes" : "no"}`);
  if (run.economy) {
    console.log(
      `  Economy caps: iterations=${run.economy.maxIterationsCap ?? "-"} toolChars=${run.economy.toolResultMaxChars ?? "-"} contextTokens=${run.economy.contextMaxTokens ?? "-"}`,
    );
  }

  console.log("Spend guard");
  console.log(`  Daily budget: ${formatUsd(spend?.dailyBudgetUsd ?? null)}`);
  console.log(`  Spent 24h: ${formatUsd(spend?.spentLast24hUsd ?? 0)}`);
  console.log(`  Remaining: ${formatUsd(spend?.remainingUsd ?? null)}`);
  console.log(`  Paused: ${spend?.paused ? "yes" : "no"}`);
  console.log(`  Auto-pause on limit: ${spend?.autoPauseOnLimit ? "yes" : "no"}`);
  console.log(`  Over limit: ${spend?.exceeded ? "yes" : "no"}`);
}

function printDaemonSnapshot(snapshot: DaemonSettingsSnapshot): void {
  console.log("Daemon profile");
  console.log(`  Bind: ${snapshot.desired.bindMode} (${snapshot.desired.host}:${snapshot.desired.port})`);
  console.log(`  Auth: ${snapshot.desired.authMode}${snapshot.desired.authMode === "token" ? " (token set)" : ""}`);
  console.log(`  Security policy: ${snapshot.desired.securityPolicy}`);
  console.log(`  Updated: ${snapshot.desired.updatedAt}`);
  console.log(`  Settings file: ${snapshot.settingsFile}`);
  console.log("Daemon effective runtime");
  console.log(`  Bind: ${snapshot.effective.bindMode} (${snapshot.effective.host}:${snapshot.effective.port})`);
  console.log(`  Auth: ${snapshot.effective.authMode}${snapshot.effective.tokenSet ? " (token set)" : " (no token)"}`);
  console.log(`  Security policy: ${snapshot.effective.securityPolicy}`);
  console.log(`  Restart required: ${snapshot.restartRequired ? "yes" : "no"}`);
}

export function settingsCommand(): Command {
  const cmd = new Command("settings").description("Runtime settings (UI parity): mode, approval, economy, budget, thinking, undo guarantee");

  cmd
    .command("status")
    .description("Show active runtime settings")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .option("--json", "Output raw JSON", false)
    .action(async (opts: { url?: string; token?: string; json?: boolean }) => {
      try {
        const snapshot = await fetchSnapshot(opts.url, opts.token);
        if (opts.json) {
          console.log(JSON.stringify(snapshot, null, 2));
          return;
        }
        printSnapshot(snapshot);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  cmd
    .command("set")
    .description("Update runtime settings")
    .option("--mode <mode>", "Run mode: interactive|autonomous|supervised")
    .option("--approval <mode>", "Approval mode: off|mutate|always")
    .option("--preset <name>", "Quick preset: economy|balanced|power")
    .option("--max-iterations <n>", "Configured max tool iterations")
    .option("--economy <state>", "Economy mode: on|off")
    .option("--budget <usd|off>", "Daily USD budget (or off)")
    .option("--spend-paused <state>", "Pause/resume runs when budget guard is active: on|off")
    .option("--undo-guarantee <mode>", "Undo guarantee: strict|open")
    .option("--thinking <level>", "Thinking level: off|low|medium|high")
    .option("--reasoning-visibility <mode>", "Reasoning visibility: off|on|stream")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .option("--json", "Output raw JSON", false)
    .action(async (opts: {
      mode?: string;
      approval?: string;
      maxIterations?: string;
      economy?: string;
      budget?: string;
      spendPaused?: string;
      undoGuarantee?: string;
      thinking?: string;
      reasoningVisibility?: string;
      preset?: string;
      url?: string;
      token?: string;
      json?: boolean;
    }) => {
      try {
        const runPatch: Record<string, unknown> = {};
        const thinkingPatch: Record<string, unknown> = {};
        let approvalToSet: ApprovalModeResponse["mode"] | undefined;

        if (opts.preset) {
          const preset = opts.preset.trim().toLowerCase();
          if (preset === "economy") {
            runPatch.mode = "supervised";
            runPatch.maxIterations = 6;
            runPatch.economyMode = true;
            runPatch.allowIrreversibleActions = false;
            thinkingPatch.level = "off";
            thinkingPatch.visibility = "off";
            approvalToSet = "always";
          } else if (preset === "balanced") {
            runPatch.mode = "supervised";
            runPatch.maxIterations = 12;
            runPatch.economyMode = false;
            runPatch.allowIrreversibleActions = false;
            thinkingPatch.level = "medium";
            thinkingPatch.visibility = "stream";
            approvalToSet = "mutate";
          } else if (preset === "power") {
            runPatch.mode = "autonomous";
            runPatch.maxIterations = 30;
            runPatch.economyMode = false;
            runPatch.allowIrreversibleActions = true;
            thinkingPatch.level = "high";
            thinkingPatch.visibility = "stream";
            approvalToSet = "off";
          } else {
            throw new Error("preset must be economy, balanced, or power");
          }
        }

        const mode = parseEnumValue(opts.mode, "mode", RUN_MODES);
        if (mode) runPatch.mode = mode;

        if (opts.maxIterations !== undefined) {
          const parsed = Number.parseInt(opts.maxIterations, 10);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error("max-iterations must be a positive integer");
          }
          runPatch.maxIterations = parsed;
        }
        const economy = parseOnOff(opts.economy, "economy");
        if (typeof economy === "boolean") runPatch.economyMode = economy;

        const budget = parseBudget(opts.budget);
        if (budget !== undefined) runPatch.dailyBudgetUsd = budget;

        const spendPaused = parseOnOff(opts.spendPaused, "spend-paused");
        if (typeof spendPaused === "boolean") runPatch.spendPaused = spendPaused;

        if (opts.undoGuarantee) {
          const normalized = opts.undoGuarantee.trim().toLowerCase();
          if (normalized !== "strict" && normalized !== "open") {
            throw new Error("undo-guarantee must be strict or open");
          }
          runPatch.allowIrreversibleActions = normalized === "open";
        }

        if (Object.keys(runPatch).length > 0) {
          await daemonRequest("/chat/run-config", {
            url: opts.url,
            token: opts.token,
            method: "POST",
            body: runPatch,
          });
        }

        const approval = parseEnumValue(opts.approval, "approval", APPROVAL_MODES);
        if (approval) approvalToSet = approval;
        if (approvalToSet) {
          await daemonRequest("/chat/approval-mode", {
            url: opts.url,
            token: opts.token,
            method: "POST",
            body: { mode: approvalToSet },
          });
        }

        const thinking = parseEnumValue(opts.thinking, "thinking", THINKING_LEVELS);
        if (thinking) thinkingPatch.level = thinking;
        const visibility = parseEnumValue(
          opts.reasoningVisibility,
          "reasoning-visibility",
          REASONING_VISIBILITY,
        );
        if (visibility) thinkingPatch.visibility = visibility;
        if (Object.keys(thinkingPatch).length > 0) {
          await daemonRequest("/chat/thinking", {
            url: opts.url,
            token: opts.token,
            method: "POST",
            body: thinkingPatch,
          });
        }

        if (
          Object.keys(runPatch).length === 0 &&
          !approvalToSet &&
          Object.keys(thinkingPatch).length === 0
        ) {
          throw new Error("No settings were provided. Use --preset/--mode/--approval/--economy/etc.");
        }

        const snapshot = await fetchSnapshot(opts.url, opts.token);
        if (opts.json) {
          console.log(JSON.stringify(snapshot, null, 2));
          return;
        }
        console.log("Settings updated.");
        printSnapshot(snapshot);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  const daemonCmd = cmd
    .command("daemon")
    .description("Daemon bind/auth/security profile settings");

  daemonCmd
    .command("status")
    .description("Show daemon bind/auth/security profile")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .option("--json", "Output raw JSON", false)
    .action(async (opts: { url?: string; token?: string; json?: boolean }) => {
      try {
        const snapshot = await fetchDaemonSnapshot(opts.url, opts.token);
        if (opts.json) {
          console.log(JSON.stringify(snapshot, null, 2));
          return;
        }
        printDaemonSnapshot(snapshot);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  daemonCmd
    .command("set")
    .description("Update daemon bind/auth/security profile")
    .option("--port <port>", "Daemon port")
    .option("--host <host>", "Daemon host (used with --bind custom)")
    .option("--bind <mode>", "Bind mode: loopback|all|custom")
    .option("--auth <mode>", "Auth mode: open|token")
    .option("--token-value <token>", "Token to use when auth=token")
    .option("--rotate-token", "Generate a new token")
    .option("--security <policy>", "Security profile: strict|balanced|permissive")
    .option("--url <url>", "Daemon base URL")
    .option("--token <token>", "Daemon bearer token")
    .option("--json", "Output raw JSON", false)
    .action(async (opts: {
      port?: string;
      host?: string;
      bind?: string;
      auth?: string;
      tokenValue?: string;
      rotateToken?: boolean;
      security?: string;
      url?: string;
      token?: string;
      json?: boolean;
    }) => {
      try {
        const patch: Record<string, unknown> = {};
        if (opts.port !== undefined) {
          const parsed = Number.parseInt(opts.port, 10);
          if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
            throw new Error("port must be a number between 1 and 65535");
          }
          patch.port = parsed;
        }
        if (opts.host !== undefined) patch.host = opts.host.trim();
        const bind = parseEnumValue(opts.bind, "bind", DAEMON_BIND_MODES);
        if (bind) patch.bindMode = bind;
        const auth = parseEnumValue(opts.auth, "auth", DAEMON_AUTH_MODES);
        if (auth) patch.authMode = auth;
        if (opts.tokenValue !== undefined) patch.token = opts.tokenValue.trim();
        if (opts.rotateToken) patch.rotateToken = true;
        const security = parseEnumValue(opts.security, "security", DAEMON_SECURITY_POLICIES);
        if (security) patch.securityPolicy = security;

        if (Object.keys(patch).length === 0) {
          throw new Error("No daemon settings were provided. Use --bind/--auth/--port/--security/etc.");
        }

        await daemonRequest("/settings/daemon", {
          url: opts.url,
          token: opts.token,
          method: "PATCH",
          body: patch,
        });

        const snapshot = await fetchDaemonSnapshot(opts.url, opts.token);
        if (opts.json) {
          console.log(JSON.stringify(snapshot, null, 2));
          return;
        }
        console.log("Daemon settings updated.");
        printDaemonSnapshot(snapshot);
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });

  return cmd;
}
