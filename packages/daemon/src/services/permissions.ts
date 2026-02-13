import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();
const TCC_DIRS = ["Downloads", "Desktop", "Documents", "Movies", "Music", "Pictures"];

export type PermissionStatus = {
  fullDiskAccess: boolean;
  details: Record<string, boolean>;
  platform: string;
  fix?: string;
};

export function checkPermissions(): PermissionStatus {
  const platform = `${os.type()} ${os.release()} (${os.arch()})`;

  if (process.platform !== "darwin") {
    return { fullDiskAccess: true, details: {}, platform };
  }

  const details: Record<string, boolean> = {};
  let allOk = true;

  for (const dir of TCC_DIRS) {
    const fullPath = path.join(HOME, dir);
    try {
      const raw = execSync(`ls -1A ${JSON.stringify(fullPath)} 2>/dev/null | wc -l`, {
        encoding: "utf-8",
        timeout: 3000,
      }).trim();
      const count = Number.parseInt(raw, 10) || 0;
      details[dir] = count > 0;
      if (count === 0) allOk = false;
    } catch {
      details[dir] = false;
      allOk = false;
    }
  }

  const hasAnyContent = Object.values(details).some(Boolean);
  const fda = hasAnyContent ? allOk : false;

  return {
    fullDiskAccess: fda,
    details,
    platform,
    ...(!fda
      ? {
          fix: "Grant Full Disk Access to your terminal app: System Settings → Privacy & Security → Full Disk Access → enable Terminal/iTerm2/Warp, then restart the terminal.",
        }
      : {}),
  };
}
