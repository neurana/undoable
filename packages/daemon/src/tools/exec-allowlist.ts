import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type AllowlistEntry = {
  pattern: string;
  lastUsedAt?: number;
};

export type ExecSecurityMode = "deny" | "allowlist" | "full";

export type ExecAllowlistConfig = {
  security: ExecSecurityMode;
  safeBins: Set<string>;
  allowlist: AllowlistEntry[];
};

const DEFAULT_SAFE_BINS = [
  // Core utilities
  "jq", "grep", "egrep", "fgrep", "cut", "sort", "uniq",
  "head", "tail", "tr", "wc", "cat", "less", "more",
  "echo", "printf", "date", "which", "whoami", "hostname",
  "pwd", "env", "true", "false", "test", "expr",
  "ls", "find", "file", "stat", "du", "df", "basename", "dirname",
  "sed", "awk", "xargs", "tee", "timeout", "time",
  // File operations
  "mkdir", "touch", "cp", "mv", "ln", "rm", "rmdir",
  "tar", "gzip", "gunzip", "zip", "unzip", "bzip2", "xz",
  "diff", "patch", "chmod", "chown",
  // Git
  "git", "gh",
  // Package managers
  "brew", "apt", "apt-get", "dpkg", "yum", "dnf", "pacman", "apk",
  "snap", "flatpak", "nix",
  // JavaScript/Node
  "node", "npm", "npx", "pnpm", "yarn", "bun", "deno",
  "tsc", "tsx", "vitest", "jest", "mocha",
  "eslint", "prettier", "webpack", "vite", "esbuild", "rollup", "turbo",
  // Python
  "python", "python3", "pip", "pip3", "pipx", "uv", "poetry", "pdm", "conda",
  "pytest", "mypy", "black", "ruff", "isort", "flake8",
  // Rust
  "cargo", "rustc", "rustup", "clippy",
  // Go
  "go", "gofmt",
  // Ruby
  "ruby", "gem", "bundle", "bundler", "rake", "rails",
  // PHP
  "php", "composer",
  // Java/JVM
  "java", "javac", "mvn", "gradle", "kotlin", "kotlinc",
  // Swift/Apple
  "swift", "swiftc", "xcodebuild", "xcrun",
  // C/C++
  "make", "cmake", "gcc", "g++", "clang", "clang++",
  // Network
  "curl", "wget", "http", "httpie",
  "ssh", "scp", "rsync", "sftp",
  // Containers
  "docker", "docker-compose", "podman", "kubectl", "helm", "minikube",
  // Document conversion
  "pandoc", "wkhtmltopdf", "pdflatex", "xelatex", "lualatex",
  // Media tools
  "ffmpeg", "ffprobe", "convert", "magick", "exiftool", "imagemagick",
  // Text processing & search
  "rg", "ag", "fd", "bat", "tree", "exa", "eza", "fzf",
  // System info
  "uname", "uptime", "free", "top", "htop", "ps", "kill", "killall",
  // Misc dev tools
  "code", "subl", "open", "pbcopy", "pbpaste", "xclip",
  "yq", "sqlite3", "psql", "mysql", "redis-cli", "mongosh",
];

const CONFIG_PATH = path.join(os.homedir(), ".undoable", "exec-allowlist.json");

export type AllowlistFile = {
  version: 1;
  security?: ExecSecurityMode;
  safeBins?: string[];
  allowlist?: AllowlistEntry[];
};

export function loadAllowlistConfig(): ExecAllowlistConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return {
        security: "allowlist",
        safeBins: new Set(DEFAULT_SAFE_BINS),
        allowlist: [],
      };
    }
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const file = JSON.parse(raw) as AllowlistFile;
    return {
      security: file.security ?? "allowlist",
      safeBins: new Set([...DEFAULT_SAFE_BINS, ...(file.safeBins ?? [])]),
      allowlist: file.allowlist ?? [],
    };
  } catch {
    return {
      security: "allowlist",
      safeBins: new Set(DEFAULT_SAFE_BINS),
      allowlist: [],
    };
  }
}

export function saveAllowlistConfig(config: ExecAllowlistConfig): void {
  const file: AllowlistFile = {
    version: 1,
    security: config.security,
    safeBins: [...config.safeBins].filter((b) => !DEFAULT_SAFE_BINS.includes(b)),
    allowlist: config.allowlist,
  };
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(file, null, 2) + "\n", { mode: 0o600 });
}

export function addToAllowlist(config: ExecAllowlistConfig, pattern: string): void {
  const trimmed = pattern.trim();
  if (!trimmed) return;
  if (config.allowlist.some((e) => e.pattern === trimmed)) return;
  config.allowlist.push({ pattern: trimmed, lastUsedAt: Date.now() });
}

export type CommandSegment = {
  raw: string;
  executable: string;
  args: string[];
};

export type CommandAnalysis = {
  ok: boolean;
  reason?: string;
  segments: CommandSegment[];
  hasPipe: boolean;
  hasChain: boolean;
  hasRedirect: boolean;
};

export function analyzeCommand(command: string): CommandAnalysis {
  const trimmed = command.trim();
  if (!trimmed) return { ok: false, reason: "empty command", segments: [], hasPipe: false, hasChain: false, hasRedirect: false };

  let hasPipe = false;
  let hasChain = false;
  let hasRedirect = false;

  const redirectMatch = /(?<![\\])[><]/.test(trimmed);
  if (redirectMatch) hasRedirect = true;

  const chainParts = splitByChainOperators(trimmed);
  if (chainParts.length > 1) hasChain = true;

  const segments: CommandSegment[] = [];
  for (const part of chainParts) {
    const pipeParts = splitByPipe(part);
    if (pipeParts.length > 1) hasPipe = true;

    for (const pipePart of pipeParts) {
      const cleaned = stripRedirects(pipePart).trim();
      if (!cleaned) continue;
      const tokens = tokenize(cleaned);
      if (tokens.length === 0) continue;
      segments.push({
        raw: pipePart.trim(),
        executable: tokens[0]!,
        args: tokens.slice(1),
      });
    }
  }

  if (segments.length === 0) {
    return { ok: false, reason: "no executable found", segments: [], hasPipe, hasChain, hasRedirect };
  }

  return { ok: true, segments, hasPipe, hasChain, hasRedirect };
}

function splitByChainOperators(command: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (escaped) { buf += ch; escaped = false; continue; }
    if (ch === "\\" && !inSingle) { escaped = true; buf += ch; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; buf += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; buf += ch; continue; }
    if (inSingle || inDouble) { buf += ch; continue; }

    if (ch === "&" && command[i + 1] === "&") {
      parts.push(buf);
      buf = "";
      i++;
      continue;
    }
    if (ch === "|" && command[i + 1] === "|") {
      parts.push(buf);
      buf = "";
      i++;
      continue;
    }
    if (ch === ";") {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  return parts.filter((p) => p.trim().length > 0);
}

function splitByPipe(command: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (escaped) { buf += ch; escaped = false; continue; }
    if (ch === "\\" && !inSingle) { escaped = true; buf += ch; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; buf += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; buf += ch; continue; }
    if (inSingle || inDouble) { buf += ch; continue; }

    if (ch === "|" && command[i + 1] !== "|") {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  return parts.filter((p) => p.trim().length > 0);
}

function stripRedirects(segment: string): string {
  return segment.replace(/\s*[12]?>>?\s*\S+/g, "").replace(/\s*<\s*\S+/g, "");
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (escaped) { buf += ch; escaped = false; continue; }
    if (ch === "\\" && !inSingle) { escaped = true; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (!inSingle && !inDouble && /\s/.test(ch)) {
      if (buf) { tokens.push(buf); buf = ""; }
      continue;
    }
    buf += ch;
  }
  if (buf) tokens.push(buf);
  return tokens;
}

export function evaluateCommand(command: string, config: ExecAllowlistConfig): {
  allowed: boolean;
  reason?: string;
  analysis: CommandAnalysis;
} {
  if (config.security === "full") {
    return { allowed: true, analysis: analyzeCommand(command) };
  }

  if (config.security === "deny") {
    return { allowed: false, reason: "exec is denied by security policy", analysis: analyzeCommand(command) };
  }

  const analysis = analyzeCommand(command);
  if (!analysis.ok) {
    return { allowed: false, reason: analysis.reason, analysis };
  }

  for (const segment of analysis.segments) {
    const execName = path.basename(segment.executable).toLowerCase();

    if (config.safeBins.has(execName)) continue;

    const matchesAllowlist = config.allowlist.some((entry) => {
      const pattern = entry.pattern.toLowerCase();
      if (pattern === execName) return true;
      if (pattern.includes("/") && segment.executable.toLowerCase().includes(pattern)) return true;
      if (pattern.includes("*")) {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$", "i");
        return regex.test(execName) || regex.test(segment.executable);
      }
      return false;
    });

    if (!matchesAllowlist) {
      return { allowed: false, reason: `'${execName}' is not in the allowlist or safe bins`, analysis };
    }
  }

  return { allowed: true, analysis };
}
