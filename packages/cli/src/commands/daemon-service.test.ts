import { describe, expect, it } from "vitest";
import {
  DAEMON_SERVICE_LABEL,
  renderLaunchdPlist,
  renderSystemdUnit,
} from "./daemon-service.js";

describe("daemon service templates", () => {
  it("renders launchd plist with expected label and environment", () => {
    const plist = renderLaunchdPlist({
      label: DAEMON_SERVICE_LABEL,
      nodeBinary: "/opt/homebrew/bin/node",
      daemonEntry: "/Users/test/Local Documents/undoable/dist/daemon/index.mjs",
      port: 7433,
      logPath: "/Users/test/.undoable/logs/daemon-service.log",
      homeDir: "/Users/test",
    });

    expect(plist).toContain(`<string>${DAEMON_SERVICE_LABEL}</string>`);
    expect(plist).toContain("<key>NRN_PORT</key>");
    expect(plist).toContain("<string>7433</string>");
    expect(plist).toContain("<key>UNDOABLE_DAEMON_SETTINGS_FILE</key>");
    expect(plist).toContain("/Users/test/.undoable/daemon-settings.json");
    expect(plist).toContain("daemon-service.log");
    expect(plist).toContain("Local Documents");
  });

  it("renders systemd unit with escaped exec start and restart policy", () => {
    const unit = renderSystemdUnit({
      nodeBinary: "/usr/local/bin/node",
      daemonEntry: "/home/test/Local Documents/undoable/dist/daemon/index.mjs",
      port: 7433,
      homeDir: "/home/test",
    });

    expect(unit).toContain(`[Install]\nWantedBy=default.target`);
    expect(unit).toContain(`Environment=NRN_PORT=7433`);
    expect(unit).toContain(`Environment=UNDOABLE_DAEMON_SETTINGS_FILE=/home/test/.undoable/daemon-settings.json`);
    expect(unit).toContain(`Restart=always`);
    expect(unit).toContain("/home/test/Local\\ Documents/undoable/dist/daemon/index.mjs");
    expect(unit).toContain(`Description=Undoable daemon service`);
  });
});
