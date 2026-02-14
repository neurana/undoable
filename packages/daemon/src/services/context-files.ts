import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ContextFile = {
  path: string;
  content: string;
};

const CONTEXT_FILE_NAMES = [
  "SOUL.md",
  "USER.md",
  "IDENTITY.md",
  "AGENTS.md",
  "TOOLS.md",
  "CONTEXT.md",
  "README.md",
];

const GLOBAL_CONTEXT_FILES = [
  "SOUL.md",
  "USER.md",
  "IDENTITY.md",
];

const MAX_FILE_SIZE = 50_000;
const MAX_TOTAL_SIZE = 150_000;

export function loadContextFiles(workspaceDir: string): ContextFile[] {
  const files: ContextFile[] = [];
  let totalSize = 0;

  for (const name of CONTEXT_FILE_NAMES) {
    const filePath = path.join(workspaceDir, name);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > MAX_FILE_SIZE) continue;
      if (totalSize + stat.size > MAX_TOTAL_SIZE) break;

      const content = fs.readFileSync(filePath, "utf-8");
      files.push({ path: name, content });
      totalSize += content.length;
    } catch {
      continue;
    }
  }

  const globalDir = path.join(os.homedir(), ".undoable");
  const seen = new Set(files.map((f) => f.path));
  for (const name of GLOBAL_CONTEXT_FILES) {
    if (seen.has(name)) continue;
    const filePath = path.join(globalDir, name);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > MAX_FILE_SIZE) continue;
      if (totalSize + stat.size > MAX_TOTAL_SIZE) break;
      const content = fs.readFileSync(filePath, "utf-8");
      files.push({ path: name, content });
      totalSize += content.length;
    } catch { continue; }
  }

  const contextDir = path.join(workspaceDir, ".undoable", "context");
  try {
    if (fs.existsSync(contextDir) && fs.statSync(contextDir).isDirectory()) {
      const entries = fs.readdirSync(contextDir).filter((f) => f.endsWith(".md")).sort();
      for (const entry of entries) {
        const filePath = path.join(contextDir, entry);
        try {
          const stat = fs.statSync(filePath);
          if (!stat.isFile() || stat.size > MAX_FILE_SIZE) continue;
          if (totalSize + stat.size > MAX_TOTAL_SIZE) break;

          const content = fs.readFileSync(filePath, "utf-8");
          files.push({ path: `.undoable/context/${entry}`, content });
          totalSize += content.length;
        } catch {
          continue;
        }
      }
    }
  } catch { }

  return files;
}
