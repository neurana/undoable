import { execSync } from "node:child_process";

export type ReversalResult = {
  canReverse: boolean;
  reverseCommand?: string;
  warning?: string;
};

type CommandPattern = {
  pattern: RegExp;
  reverse: (match: RegExpMatchArray, cwd?: string) => ReversalResult;
};

const PATTERNS: CommandPattern[] = [
  {
    pattern: /^mkdir\s+(?:-p\s+)?(.+)$/,
    reverse: (m) => {
      const dir = m[1] ?? "";
      return { canReverse: true, reverseCommand: `rmdir ${dir.trim()}` };
    },
  },
  {
    pattern: /^rm\s+-rf?\s+(.+)$/,
    reverse: () => ({ canReverse: false, warning: "Deleted files cannot be recovered" }),
  },
  {
    pattern: /^rm\s+(.+)$/,
    reverse: () => ({ canReverse: false, warning: "Deleted files cannot be recovered" }),
  },
  {
    pattern: /^cp\s+(?:-r\s+)?(.+)\s+(.+)$/,
    reverse: (m) => {
      const dest = m[2] ?? "";
      return { canReverse: true, reverseCommand: `rm -rf ${dest.trim()}` };
    },
  },
  {
    pattern: /^mv\s+(.+)\s+(.+)$/,
    reverse: (m) => {
      const src = m[1] ?? "";
      const dest = m[2] ?? "";
      return { canReverse: true, reverseCommand: `mv ${dest.trim()} ${src.trim()}` };
    },
  },
  {
    pattern: /^touch\s+(.+)$/,
    reverse: (m) => {
      const file = m[1] ?? "";
      return { canReverse: true, reverseCommand: `rm ${file.trim()}` };
    },
  },
  {
    pattern: /^npm\s+install\s+(?:--save-dev\s+|--save\s+|-D\s+|-S\s+)?([^\s]+)$/,
    reverse: (m) => {
      const pkg = m[1] ?? "";
      return { canReverse: true, reverseCommand: `npm uninstall ${pkg.trim()}` };
    },
  },
  {
    pattern: /^npm\s+i\s+(?:--save-dev\s+|--save\s+|-D\s+|-S\s+)?([^\s]+)$/,
    reverse: (m) => {
      const pkg = m[1] ?? "";
      return { canReverse: true, reverseCommand: `npm uninstall ${pkg.trim()}` };
    },
  },
  {
    pattern: /^pnpm\s+(?:add|install)\s+(?:-D\s+)?([^\s]+)$/,
    reverse: (m) => {
      const pkg = m[1] ?? "";
      return { canReverse: true, reverseCommand: `pnpm remove ${pkg.trim()}` };
    },
  },
  {
    pattern: /^yarn\s+add\s+(?:--dev\s+|-D\s+)?([^\s]+)$/,
    reverse: (m) => {
      const pkg = m[1] ?? "";
      return { canReverse: true, reverseCommand: `yarn remove ${pkg.trim()}` };
    },
  },
  {
    pattern: /^git\s+commit\s+/,
    reverse: () => ({ canReverse: true, reverseCommand: "git reset --soft HEAD~1" }),
  },
  {
    pattern: /^git\s+add\s+(.+)$/,
    reverse: (m) => {
      const files = m[1] ?? "";
      return { canReverse: true, reverseCommand: `git reset HEAD ${files.trim()}` };
    },
  },
  {
    pattern: /^git\s+stash$/,
    reverse: () => ({ canReverse: true, reverseCommand: "git stash pop" }),
  },
  {
    pattern: /^git\s+stash\s+push/,
    reverse: () => ({ canReverse: true, reverseCommand: "git stash pop" }),
  },
  {
    pattern: /^git\s+branch\s+(?:-d\s+|-D\s+)(.+)$/,
    reverse: () => ({ canReverse: false, warning: "Deleted branch may not be recoverable" }),
  },
  {
    pattern: /^git\s+checkout\s+-b\s+(.+)$/,
    reverse: (m) => {
      const branch = (m[1] ?? "").trim().split(/\s/)[0] ?? "";
      return { canReverse: true, reverseCommand: `git checkout - && git branch -d ${branch}` };
    },
  },
  {
    pattern: /^git\s+push\s+/,
    reverse: () => ({ canReverse: false, warning: "Pushed commits require force push to undo" }),
  },
  {
    pattern: /^chmod\s+(\d+)\s+(.+)$/,
    reverse: (m, cwd) => {
      const file = m[2] ?? "";
      try {
        const currentMode = execSync(`stat -f "%OLp" ${file.trim()}`, {
          cwd,
          encoding: "utf-8",
          timeout: 3000,
        }).trim();
        return { canReverse: true, reverseCommand: `chmod ${currentMode} ${file.trim()}` };
      } catch {
        return { canReverse: false, warning: "Could not determine original permissions" };
      }
    },
  },
  {
    pattern: /^ln\s+(?:-s\s+)?(.+)\s+(.+)$/,
    reverse: (m) => {
      const link = m[2] ?? "";
      return { canReverse: true, reverseCommand: `rm ${link.trim()}` };
    },
  },
  {
    pattern: /^docker\s+run\s+/,
    reverse: () => ({ canReverse: false, warning: "Container may need manual cleanup" }),
  },
  {
    pattern: /^docker\s+build\s+/,
    reverse: () => ({ canReverse: false, warning: "Built image may need manual removal" }),
  },
];

export function getReversalCommand(command: string, cwd?: string): ReversalResult {
  const trimmed = command.trim();
  for (const { pattern, reverse } of PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return reverse(match, cwd);
    }
  }
  return { canReverse: false };
}

export function executeReversal(reverseCommand: string, cwd?: string): { success: boolean; error?: string } {
  try {
    execSync(reverseCommand, {
      cwd,
      encoding: "utf-8",
      timeout: 30000,
      stdio: "pipe",
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
