import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DAEMON_SERVICE_LABEL = "xyz.undoable.daemon";
export const DAEMON_SYSTEMD_UNIT_NAME = "undoable-daemon.service";

export type DaemonServicePlatform = "launchd" | "systemd-user";

export type DaemonServiceStatus = {
  platform: DaemonServicePlatform;
  serviceId: string;
  unitPath: string;
  installed: boolean;
  enabled: boolean;
  active: boolean;
  logsHint: string;
  detail?: string;
};

type CommandResult = {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
};

type LaunchdPaths = {
  plistPath: string;
  serviceTarget: string;
  domainTarget: string;
  logPath: string;
};

type SystemdPaths = {
  unitPath: string;
  unitName: string;
};

export function detectDaemonServicePlatform(): DaemonServicePlatform | null {
  if (process.platform === "darwin") return "launchd";
  if (process.platform === "linux") return "systemd-user";
  return null;
}

function normalizeOutput(value: string | Buffer | null | undefined): string {
  if (typeof value === "string") return value;
  if (!value) return "";
  return value.toString("utf-8");
}

function runCommand(
  command: string,
  args: string[],
  opts?: { allowFailure?: boolean },
): CommandResult {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (result.error && opts?.allowFailure !== true) {
    throw new Error(
      `Failed to run ${command}: ${result.error.message}`,
    );
  }
  const stdout = normalizeOutput(result.stdout);
  const stderr = normalizeOutput(result.stderr);
  const ok = (result.status ?? 1) === 0;
  if (!ok && opts?.allowFailure !== true) {
    const message = [stderr.trim(), stdout.trim()]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      message.length > 0
        ? message
        : `Command failed: ${command} ${args.join(" ")}`,
    );
  }
  return {
    ok,
    status: result.status,
    stdout,
    stderr,
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderLaunchdPlist(input: {
  label: string;
  nodeBinary: string;
  daemonEntry: string;
  port: number;
  logPath: string;
  homeDir: string;
}): string {
  const args = [input.nodeBinary, input.daemonEntry]
    .map((arg) => `      <string>${escapeXml(arg)}</string>`)
    .join("\n");
  const settingsFile = path.join(
    input.homeDir,
    ".undoable",
    "daemon-settings.json",
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${escapeXml(input.label)}</string>
    <key>ProgramArguments</key>
    <array>
${args}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${escapeXml(path.dirname(input.daemonEntry))}</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>NRN_PORT</key>
      <string>${input.port}</string>
      <key>HOME</key>
      <string>${escapeXml(input.homeDir)}</string>
      <key>UNDOABLE_DAEMON_SETTINGS_FILE</key>
      <string>${escapeXml(settingsFile)}</string>
    </dict>
    <key>StandardOutPath</key>
    <string>${escapeXml(input.logPath)}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(input.logPath)}</string>
  </dict>
</plist>
`;
}

function escapeSystemdExecArg(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(" ", "\\ ");
}

function renderSystemdEnvironment(name: string, value: string): string {
  return `Environment=${escapeSystemdExecArg(`${name}=${value}`)}`;
}

export function renderSystemdUnit(input: {
  nodeBinary: string;
  daemonEntry: string;
  port: number;
  homeDir: string;
}): string {
  const execStart = `${escapeSystemdExecArg(input.nodeBinary)} ${escapeSystemdExecArg(input.daemonEntry)}`;
  const settingsFile = path.join(
    input.homeDir,
    ".undoable",
    "daemon-settings.json",
  );
  return `[Unit]
Description=Undoable daemon service
After=network.target

[Service]
Type=simple
${renderSystemdEnvironment("NRN_PORT", String(input.port))}
${renderSystemdEnvironment("HOME", input.homeDir)}
${renderSystemdEnvironment("UNDOABLE_DAEMON_SETTINGS_FILE", settingsFile)}
ExecStart=${execStart}
Restart=always
RestartSec=2
KillSignal=SIGTERM
TimeoutStopSec=15
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
`;
}

function resolveLaunchdPaths(homeDir: string, uid: number): LaunchdPaths {
  const plistPath = path.join(
    homeDir,
    "Library",
    "LaunchAgents",
    `${DAEMON_SERVICE_LABEL}.plist`,
  );
  const domainTarget = `gui/${uid}`;
  return {
    plistPath,
    serviceTarget: `${domainTarget}/${DAEMON_SERVICE_LABEL}`,
    domainTarget,
    logPath: path.join(homeDir, ".undoable", "logs", "daemon-service.log"),
  };
}

function resolveSystemdPaths(homeDir: string): SystemdPaths {
  return {
    unitPath: path.join(
      homeDir,
      ".config",
      "systemd",
      "user",
      DAEMON_SYSTEMD_UNIT_NAME,
    ),
    unitName: DAEMON_SYSTEMD_UNIT_NAME,
  };
}

function resolveDaemonDistEntry(rootDir: string): string {
  return path.join(rootDir, "dist", "daemon", "index.mjs");
}

function assertBuiltDaemon(rootDir: string): string {
  const entry = resolveDaemonDistEntry(rootDir);
  if (!fs.existsSync(entry)) {
    throw new Error(
      `Built daemon entry not found at ${entry}. Run \`pnpm build\` first.`,
    );
  }
  return entry;
}

function assertSupportedPlatform(): DaemonServicePlatform {
  const platform = detectDaemonServicePlatform();
  if (!platform) {
    throw new Error(
      `Daemon service is only supported on macOS and Linux (current: ${process.platform}).`,
    );
  }
  return platform;
}

function launchdStatus(homeDir: string): DaemonServiceStatus {
  const uid = process.getuid?.();
  if (typeof uid !== "number") {
    throw new Error("Unable to resolve current user id for launchd service.");
  }
  const paths = resolveLaunchdPaths(homeDir, uid);
  const installed = fs.existsSync(paths.plistPath);
  const loaded = runCommand(
    "launchctl",
    ["print", paths.serviceTarget],
    { allowFailure: true },
  ).ok;
  return {
    platform: "launchd",
    serviceId: DAEMON_SERVICE_LABEL,
    unitPath: paths.plistPath,
    installed,
    enabled: installed,
    active: loaded,
    logsHint: paths.logPath,
  };
}

function systemdStatus(homeDir: string): DaemonServiceStatus {
  const paths = resolveSystemdPaths(homeDir);
  const installed = fs.existsSync(paths.unitPath);
  const enabledRes = runCommand(
    "systemctl",
    ["--user", "is-enabled", paths.unitName],
    { allowFailure: true },
  );
  const activeRes = runCommand(
    "systemctl",
    ["--user", "is-active", paths.unitName],
    { allowFailure: true },
  );
  const enabled = enabledRes.ok && enabledRes.stdout.trim() === "enabled";
  const active = activeRes.ok && activeRes.stdout.trim() === "active";
  const detailLines = [enabledRes.stderr.trim(), activeRes.stderr.trim()]
    .filter(Boolean)
    .join("\n")
    .trim();
  return {
    platform: "systemd-user",
    serviceId: paths.unitName,
    unitPath: paths.unitPath,
    installed,
    enabled,
    active,
    logsHint: `journalctl --user -u ${paths.unitName} -f`,
    detail: detailLines.length > 0 ? detailLines : undefined,
  };
}

export function getDaemonServiceStatus(rootDir: string): DaemonServiceStatus {
  void rootDir;
  const platform = assertSupportedPlatform();
  const homeDir = os.homedir();
  return platform === "launchd"
    ? launchdStatus(homeDir)
    : systemdStatus(homeDir);
}

function installLaunchdService(
  rootDir: string,
  port: number,
  startNow: boolean,
): DaemonServiceStatus {
  const uid = process.getuid?.();
  if (typeof uid !== "number") {
    throw new Error("Unable to resolve current user id for launchd service.");
  }
  const homeDir = os.homedir();
  const daemonEntry = assertBuiltDaemon(rootDir);
  const paths = resolveLaunchdPaths(homeDir, uid);
  fs.mkdirSync(path.dirname(paths.plistPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.logPath), { recursive: true });
  const plist = renderLaunchdPlist({
    label: DAEMON_SERVICE_LABEL,
    nodeBinary: process.execPath,
    daemonEntry,
    port,
    logPath: paths.logPath,
    homeDir,
  });
  fs.writeFileSync(paths.plistPath, plist, "utf-8");

  runCommand(
    "launchctl",
    ["bootout", paths.serviceTarget],
    { allowFailure: true },
  );
  runCommand(
    "launchctl",
    ["bootout", paths.domainTarget, paths.plistPath],
    { allowFailure: true },
  );
  runCommand("launchctl", ["bootstrap", paths.domainTarget, paths.plistPath]);
  if (startNow) {
    runCommand("launchctl", ["kickstart", "-k", paths.serviceTarget]);
  }
  return launchdStatus(homeDir);
}

function installSystemdService(
  rootDir: string,
  port: number,
  startNow: boolean,
): DaemonServiceStatus {
  const homeDir = os.homedir();
  const daemonEntry = assertBuiltDaemon(rootDir);
  const paths = resolveSystemdPaths(homeDir);
  fs.mkdirSync(path.dirname(paths.unitPath), { recursive: true });
  const unit = renderSystemdUnit({
    nodeBinary: process.execPath,
    daemonEntry,
    port,
    homeDir,
  });
  fs.writeFileSync(paths.unitPath, unit, "utf-8");

  runCommand("systemctl", ["--user", "daemon-reload"]);
  if (startNow) {
    runCommand("systemctl", ["--user", "enable", "--now", paths.unitName]);
  } else {
    runCommand("systemctl", ["--user", "enable", paths.unitName]);
  }
  return systemdStatus(homeDir);
}

export function installDaemonService(
  rootDir: string,
  opts: { port: number; startNow: boolean },
): DaemonServiceStatus {
  const platform = assertSupportedPlatform();
  return platform === "launchd"
    ? installLaunchdService(rootDir, opts.port, opts.startNow)
    : installSystemdService(rootDir, opts.port, opts.startNow);
}

function startLaunchdService(homeDir: string): DaemonServiceStatus {
  const uid = process.getuid?.();
  if (typeof uid !== "number") {
    throw new Error("Unable to resolve current user id for launchd service.");
  }
  const paths = resolveLaunchdPaths(homeDir, uid);
  if (!fs.existsSync(paths.plistPath)) {
    throw new Error(`Service plist not found at ${paths.plistPath}. Run \`nrn daemon service install\`.`);
  }
  runCommand("launchctl", ["bootstrap", paths.domainTarget, paths.plistPath], {
    allowFailure: true,
  });
  runCommand("launchctl", ["kickstart", "-k", paths.serviceTarget]);
  return launchdStatus(homeDir);
}

function startSystemdService(homeDir: string): DaemonServiceStatus {
  const paths = resolveSystemdPaths(homeDir);
  if (!fs.existsSync(paths.unitPath)) {
    throw new Error(`Service unit not found at ${paths.unitPath}. Run \`nrn daemon service install\`.`);
  }
  runCommand("systemctl", ["--user", "start", paths.unitName]);
  return systemdStatus(homeDir);
}

export function startDaemonService(rootDir: string): DaemonServiceStatus {
  void rootDir;
  const platform = assertSupportedPlatform();
  const homeDir = os.homedir();
  return platform === "launchd"
    ? startLaunchdService(homeDir)
    : startSystemdService(homeDir);
}

function stopLaunchdService(homeDir: string): DaemonServiceStatus {
  const uid = process.getuid?.();
  if (typeof uid !== "number") {
    throw new Error("Unable to resolve current user id for launchd service.");
  }
  const paths = resolveLaunchdPaths(homeDir, uid);
  runCommand("launchctl", ["bootout", paths.serviceTarget], {
    allowFailure: true,
  });
  runCommand("launchctl", ["bootout", paths.domainTarget, paths.plistPath], {
    allowFailure: true,
  });
  return launchdStatus(homeDir);
}

function stopSystemdService(homeDir: string): DaemonServiceStatus {
  const paths = resolveSystemdPaths(homeDir);
  runCommand("systemctl", ["--user", "stop", paths.unitName], {
    allowFailure: true,
  });
  return systemdStatus(homeDir);
}

export function stopDaemonService(rootDir: string): DaemonServiceStatus {
  void rootDir;
  const platform = assertSupportedPlatform();
  const homeDir = os.homedir();
  return platform === "launchd"
    ? stopLaunchdService(homeDir)
    : stopSystemdService(homeDir);
}

function restartLaunchdService(homeDir: string): DaemonServiceStatus {
  const uid = process.getuid?.();
  if (typeof uid !== "number") {
    throw new Error("Unable to resolve current user id for launchd service.");
  }
  const paths = resolveLaunchdPaths(homeDir, uid);
  if (!fs.existsSync(paths.plistPath)) {
    throw new Error(`Service plist not found at ${paths.plistPath}. Run \`nrn daemon service install\`.`);
  }
  runCommand("launchctl", ["bootout", paths.serviceTarget], {
    allowFailure: true,
  });
  runCommand("launchctl", ["bootstrap", paths.domainTarget, paths.plistPath]);
  runCommand("launchctl", ["kickstart", "-k", paths.serviceTarget]);
  return launchdStatus(homeDir);
}

function restartSystemdService(homeDir: string): DaemonServiceStatus {
  const paths = resolveSystemdPaths(homeDir);
  runCommand("systemctl", ["--user", "restart", paths.unitName]);
  return systemdStatus(homeDir);
}

export function restartDaemonService(rootDir: string): DaemonServiceStatus {
  void rootDir;
  const platform = assertSupportedPlatform();
  const homeDir = os.homedir();
  return platform === "launchd"
    ? restartLaunchdService(homeDir)
    : restartSystemdService(homeDir);
}

function uninstallLaunchdService(homeDir: string): DaemonServiceStatus {
  const uid = process.getuid?.();
  if (typeof uid !== "number") {
    throw new Error("Unable to resolve current user id for launchd service.");
  }
  const paths = resolveLaunchdPaths(homeDir, uid);
  runCommand("launchctl", ["bootout", paths.serviceTarget], {
    allowFailure: true,
  });
  runCommand("launchctl", ["bootout", paths.domainTarget, paths.plistPath], {
    allowFailure: true,
  });
  try {
    fs.unlinkSync(paths.plistPath);
  } catch {
    // best effort
  }
  return launchdStatus(homeDir);
}

function uninstallSystemdService(homeDir: string): DaemonServiceStatus {
  const paths = resolveSystemdPaths(homeDir);
  runCommand("systemctl", ["--user", "disable", "--now", paths.unitName], {
    allowFailure: true,
  });
  try {
    fs.unlinkSync(paths.unitPath);
  } catch {
    // best effort
  }
  runCommand("systemctl", ["--user", "daemon-reload"], {
    allowFailure: true,
  });
  return systemdStatus(homeDir);
}

export function uninstallDaemonService(rootDir: string): DaemonServiceStatus {
  void rootDir;
  const platform = assertSupportedPlatform();
  const homeDir = os.homedir();
  return platform === "launchd"
    ? uninstallLaunchdService(homeDir)
    : uninstallSystemdService(homeDir);
}
