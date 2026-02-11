import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LLMContext } from "./types.js";

const DEFAULT_MAX_FILE_SIZE = 50_000;
const DEFAULT_MAX_FILES = 50;
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".venv", "vendor"]);
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".yaml", ".yml",
  ".toml", ".py", ".rs", ".go", ".sh", ".css", ".html", ".sql",
  ".env", ".txt", ".cfg", ".ini", ".xml", ".svelte", ".vue",
]);

export type GatherOptions = {
  workingDir: string;
  instruction: string;
  maxFileSize?: number;
  maxFiles?: number;
  includeFiles?: string[];
  metadata?: Record<string, unknown>;
};

export function gatherContext(opts: GatherOptions): LLMContext {
  const context: LLMContext = {
    instruction: opts.instruction,
    metadata: opts.metadata,
  };

  context.repoStructure = gatherRepoStructure(opts.workingDir);
  context.gitStatus = gatherGitStatus(opts.workingDir);

  if (opts.includeFiles?.length) {
    context.files = readSpecificFiles(opts.workingDir, opts.includeFiles, opts.maxFileSize ?? DEFAULT_MAX_FILE_SIZE);
  }

  return context;
}

export function gatherRepoStructure(dir: string, maxDepth = 4): string[] {
  const results: string[] = [];
  walk(dir, dir, 0, maxDepth, results);
  return results;
}

function walk(base: string, current: string, depth: number, maxDepth: number, results: string[]): void {
  if (depth > maxDepth) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

    const rel = path.relative(base, path.join(current, entry.name));

    if (entry.isDirectory()) {
      results.push(`${rel}/`);
      walk(base, path.join(current, entry.name), depth + 1, maxDepth, results);
    } else {
      results.push(rel);
    }
  }
}

export function gatherGitStatus(dir: string): string | undefined {
  try {
    const result = execFileSync("git", ["status", "--short"], { cwd: dir, encoding: "utf-8", timeout: 5000 });
    return result.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function readSpecificFiles(
  baseDir: string,
  filePaths: string[],
  maxSize: number = DEFAULT_MAX_FILE_SIZE,
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];

  for (const fp of filePaths.slice(0, DEFAULT_MAX_FILES)) {
    const abs = path.resolve(baseDir, fp);
    if (!abs.startsWith(path.resolve(baseDir))) continue;

    const ext = path.extname(fp).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext) && ext !== "") continue;

    try {
      const stat = fs.statSync(abs);
      if (stat.size > maxSize) continue;
      const content = fs.readFileSync(abs, "utf-8");
      files.push({ path: fp, content });
    } catch {
      continue;
    }
  }

  return files;
}
