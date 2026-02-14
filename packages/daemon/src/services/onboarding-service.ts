import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type OnboardingProfile = {
  userName: string;
  botName: string;
  timezone: string;
  personality: string;
  instructions: string;
  completed: boolean;
};

const UNDOABLE_DIR = path.join(os.homedir(), ".undoable");

const DEFAULT_SOUL = `# SOUL.md — Bot Identity

You are a helpful, concise, and friendly AI assistant.
You value clarity over verbosity. You act first, explain later.
You are honest about uncertainty and ask clarifying questions when needed.
`;

const DEFAULT_USER = (name: string, tz: string) => `# USER.md — User Profile

- **Name:** ${name}
- **Timezone:** ${tz}
`;

const DEFAULT_IDENTITY = (botName: string) => `# IDENTITY.md — Bot Identity

- **Name:** ${botName}
- **Role:** Personal AI assistant
- **Platform:** Undoable
`;

function ensureDir() {
  if (!fs.existsSync(UNDOABLE_DIR)) {
    fs.mkdirSync(UNDOABLE_DIR, { recursive: true });
  }
}

function readFileOr(filePath: string, fallback: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return fallback;
  }
}

function extractField(content: string, field: string): string {
  const regex = new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`, "i");
  const match = content.match(regex);
  return match?.[1]?.trim() ?? "";
}

export class OnboardingService {
  isCompleted(): boolean {
    return fs.existsSync(path.join(UNDOABLE_DIR, "USER.md"));
  }

  load(): OnboardingProfile {
    ensureDir();
    const soul = readFileOr(path.join(UNDOABLE_DIR, "SOUL.md"), "");
    const user = readFileOr(path.join(UNDOABLE_DIR, "USER.md"), "");
    const identity = readFileOr(path.join(UNDOABLE_DIR, "IDENTITY.md"), "");

    return {
      userName: extractField(user, "Name") || "",
      botName: extractField(identity, "Name") || "Undoable",
      timezone: extractField(user, "Timezone") || Intl.DateTimeFormat().resolvedOptions().timeZone,
      personality: soul || "",
      instructions: extractField(identity, "Role") || "",
      completed: this.isCompleted(),
    };
  }

  save(profile: Partial<OnboardingProfile>): OnboardingProfile {
    ensureDir();
    const current = this.load();
    const merged = { ...current, ...profile, completed: true };

    const soulContent = merged.personality?.trim() || DEFAULT_SOUL;
    fs.writeFileSync(path.join(UNDOABLE_DIR, "SOUL.md"), soulContent, "utf-8");

    const userContent = DEFAULT_USER(merged.userName || "User", merged.timezone);
    fs.writeFileSync(path.join(UNDOABLE_DIR, "USER.md"), userContent, "utf-8");

    const identityContent = DEFAULT_IDENTITY(merged.botName || "Undoable");
    fs.writeFileSync(path.join(UNDOABLE_DIR, "IDENTITY.md"), identityContent, "utf-8");

    return merged;
  }
}
