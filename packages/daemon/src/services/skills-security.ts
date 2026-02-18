import fs from "node:fs";
import path from "node:path";

export type SkillScanSeverity = "critical" | "warn";

export type SkillScanFinding = {
  severity: SkillScanSeverity;
  file: string;
  line: number;
  message: string;
  snippet: string;
};

export type SkillScanSummary = {
  scannedFiles: number;
  critical: number;
  warn: number;
  findings: SkillScanFinding[];
  truncated: boolean;
};

type SkillScanRule = {
  severity: SkillScanSeverity;
  message: string;
  pattern: RegExp;
};

const MAX_SCAN_FILES = 200;
const MAX_FINDINGS = 40;
const MAX_FILE_SIZE_BYTES = 512 * 1024;

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".cache",
  ".turbo",
]);

const TEXT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".sh",
  ".bash",
  ".zsh",
  ".rb",
  ".php",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".ps1",
  ".toml",
  ".yaml",
  ".yml",
  ".json",
  ".md",
]);

const RULES: SkillScanRule[] = [
  {
    severity: "critical",
    message: "Piped remote script execution detected",
    pattern: /\b(?:curl|wget)[^\n|]{0,220}\|\s*(?:bash|sh|zsh)\b/gi,
  },
  {
    severity: "critical",
    message: "Potential destructive root wipe command detected",
    pattern: /\brm\s+-rf\s+\/(?:\s|$)/gi,
  },
  {
    severity: "warn",
    message: "Node child_process execution API usage detected",
    pattern:
      /\bchild_process\.(?:exec|execSync|spawn|spawnSync|fork)\b/gi,
  },
  {
    severity: "warn",
    message: "Python subprocess command execution API usage detected",
    pattern: /\bsubprocess\.(?:Popen|run|call|check_output)\b/gi,
  },
  {
    severity: "warn",
    message: "Potential eval/dynamic code execution usage detected",
    pattern: /\b(?:eval\s*\(|new Function\s*\()/gi,
  },
  {
    severity: "warn",
    message: "Potential shell command execution usage detected",
    pattern: /\bos\.system\s*\(/gi,
  },
];

function shouldScanFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  const base = path.basename(filePath).toLowerCase();
  return base === "dockerfile" || base === "makefile";
}

function trimSnippet(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const max = 140;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function collectCandidateFiles(rootDir: string): string[] {
  const out: string[] = [];
  const stack = [path.resolve(rootDir)];

  while (stack.length > 0 && out.length < MAX_SCAN_FILES) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!shouldScanFile(full)) continue;
      out.push(full);
      if (out.length >= MAX_SCAN_FILES) break;
    }
  }

  return out;
}

function scanContent(filePath: string, raw: string): SkillScanFinding[] {
  const findings: SkillScanFinding[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(raw)) !== null) {
      findings.push({
        severity: rule.severity,
        file: filePath,
        line: lineNumberAt(raw, match.index),
        message: rule.message,
        snippet: trimSnippet(match[0] ?? ""),
      });
      if (findings.length >= MAX_FINDINGS) return findings;
    }
  }
  return findings;
}

export function scanSkillDirectory(baseDir: string): SkillScanSummary {
  const files = collectCandidateFiles(baseDir);
  const findings: SkillScanFinding[] = [];

  for (const filePath of files) {
    if (findings.length >= MAX_FINDINGS) break;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    if (stat.size > MAX_FILE_SIZE_BYTES) continue;

    let raw: string;
    try {
      raw = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    if (!raw.trim()) continue;
    const fileFindings = scanContent(filePath, raw);
    findings.push(...fileFindings);
  }

  const critical = findings.filter((f) => f.severity === "critical").length;
  const warn = findings.filter((f) => f.severity === "warn").length;

  return {
    scannedFiles: files.length,
    critical,
    warn,
    findings: findings.slice(0, MAX_FINDINGS),
    truncated: findings.length > MAX_FINDINGS || files.length >= MAX_SCAN_FILES,
  };
}

export function formatSkillScanWarnings(
  skillName: string,
  summary: SkillScanSummary,
): string[] {
  if (summary.critical === 0 && summary.warn === 0) return [];
  const warnings: string[] = [];
  if (summary.critical > 0) {
    const top = summary.findings
      .filter((finding) => finding.severity === "critical")
      .slice(0, 3)
      .map(
        (finding) =>
          `${finding.message} (${path.basename(finding.file)}:${finding.line})`,
      );
    warnings.push(
      `WARNING: "${skillName}" has ${summary.critical} critical safety finding(s). ${top.join("; ")}`,
    );
  }
  if (summary.warn > 0) {
    warnings.push(
      `"${skillName}" has ${summary.warn} warning-level safety finding(s). Review skill files before broad usage.`,
    );
  }
  return warnings;
}
