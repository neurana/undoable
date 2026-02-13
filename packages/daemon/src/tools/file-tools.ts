import { execSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import type { AgentTool } from "./types.js";

const HOME = os.homedir();

function resolvePath(input: string | undefined, fallback?: string): string {
  let raw = input?.trim() || fallback || HOME;
  if (raw === "~") return HOME;
  if (raw.startsWith("~/")) raw = path.join(HOME, raw.slice(2));
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(HOME, raw);
}

export function createReadFileTool(): AgentTool {
  return {
    name: "read_file",
    definition: {
      type: "function",
      function: {
        name: "read_file",
        description: "Read the contents of a file from the filesystem.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute or relative file path" },
            maxLines: { type: "number", description: "Max lines to read (default: 500)" },
          },
          required: ["path"],
        },
      },
    },
    execute: async (args) => {
      const filePath = resolvePath(args.path as string);
      const maxLines = (args.maxLines as number) ?? 500;
      try {
        const content = execSync(`cat ${JSON.stringify(filePath)}`, {
          encoding: "utf-8",
          timeout: 10000,
          maxBuffer: 2 * 1024 * 1024,
        });
        const lines = content.split("\n");
        return {
          path: filePath,
          content: lines.slice(0, maxLines).join("\n"),
          lines: lines.length,
          truncated: lines.length > maxLines,
        };
      } catch (err) {
        return { path: filePath, error: `Cannot read: ${(err as Error).message}` };
      }
    },
  };
}

export function createWriteFileTool(): AgentTool {
  return {
    name: "write_file",
    definition: {
      type: "function",
      function: {
        name: "write_file",
        description: "Create or overwrite a file with the given content.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute or relative file path" },
            content: { type: "string", description: "File content to write" },
          },
          required: ["path", "content"],
        },
      },
    },
    execute: async (args) => {
      const filePath = resolvePath(args.path as string);
      try {
        execSync(`mkdir -p ${JSON.stringify(path.dirname(filePath))}`, { timeout: 5000 });
        const escaped = (args.content as string).replace(/'/g, "'\\''");
        execSync(`printf '%s' '${escaped}' > ${JSON.stringify(filePath)}`, {
          encoding: "utf-8",
          timeout: 10000,
          maxBuffer: 2 * 1024 * 1024,
        });
        return { path: filePath, written: true };
      } catch (err) {
        return { path: filePath, error: `Cannot write: ${(err as Error).message}` };
      }
    },
  };
}

export function createEditFileTool(): AgentTool {
  return {
    name: "edit_file",
    definition: {
      type: "function",
      function: {
        name: "edit_file",
        description:
          "Edit a file by replacing a specific string with new content. More precise than write_file for targeted changes.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path" },
            old_string: { type: "string", description: "Exact text to find and replace" },
            new_string: { type: "string", description: "Replacement text" },
          },
          required: ["path", "old_string", "new_string"],
        },
      },
    },
    execute: async (args) => {
      const filePath = resolvePath(args.path as string);
      const oldStr = args.old_string as string;
      const newStr = args.new_string as string;
      try {
        const content = execSync(`cat ${JSON.stringify(filePath)}`, {
          encoding: "utf-8",
          timeout: 10000,
          maxBuffer: 2 * 1024 * 1024,
        });
        const idx = content.indexOf(oldStr);
        if (idx === -1) {
          return { path: filePath, error: "old_string not found in file" };
        }
        if (content.indexOf(oldStr, idx + 1) !== -1) {
          return { path: filePath, error: "old_string matches multiple locations — be more specific" };
        }
        const updated = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
        const escaped = updated.replace(/'/g, "'\\''");
        execSync(`printf '%s' '${escaped}' > ${JSON.stringify(filePath)}`, {
          encoding: "utf-8",
          timeout: 10000,
          maxBuffer: 2 * 1024 * 1024,
        });
        return { path: filePath, edited: true };
      } catch (err) {
        return { path: filePath, error: `Cannot edit: ${(err as Error).message}` };
      }
    },
  };
}

export function createListDirTool(): AgentTool {
  return {
    name: "list_dir",
    definition: {
      type: "function",
      function: {
        name: "list_dir",
        description: "List files and directories in a given path.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path (default: home dir)" },
          },
          required: [],
        },
      },
    },
    execute: async (args) => {
      const dirPath = resolvePath(args.path as string);
      try {
        const raw = execSync(`ls -1Ap ${JSON.stringify(dirPath)} | head -n 100`, {
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
        const entries = raw
          .split("\n")
          .filter(Boolean)
          .map((name) => ({
            name: name.replace(/\/$/, ""),
            type: name.endsWith("/") ? "dir" : "file",
          }));
        if (entries.length === 0) {
          const tccDirs = ["Downloads", "Desktop", "Documents", "Movies", "Music", "Pictures"];
          const base = path.basename(dirPath);
          const parent = path.dirname(dirPath);
          if (parent === HOME && tccDirs.includes(base)) {
            return {
              entries: [],
              warning: `${dirPath} appears empty. This is likely a macOS permissions issue. Grant Full Disk Access: System Settings → Privacy & Security → Full Disk Access → enable your terminal app, then restart.`,
            };
          }
        }
        return entries;
      } catch (err) {
        return { error: `Cannot list: ${(err as Error).message}` };
      }
    },
  };
}

export function createFindFilesTool(): AgentTool {
  return {
    name: "find_files",
    definition: {
      type: "function",
      function: {
        name: "find_files",
        description: "Find files matching a glob pattern in a directory.",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Glob pattern (e.g., '*.ts')" },
            directory: { type: "string", description: "Base directory (default: home)" },
            maxResults: { type: "number", description: "Max results (default: 50)" },
          },
          required: ["pattern"],
        },
      },
    },
    execute: async (args) => {
      const dir = resolvePath(args.directory as string);
      const pattern = args.pattern as string;
      const max = (args.maxResults as number) ?? 50;
      try {
        const stdout = execSync(
          `find ${JSON.stringify(dir)} -maxdepth 5 -name ${JSON.stringify(pattern)} 2>/dev/null | head -n ${max}`,
          { encoding: "utf-8", timeout: 10000 },
        );
        return { files: stdout.trim().split("\n").filter(Boolean) };
      } catch {
        return { files: [] };
      }
    },
  };
}

export function createGrepTool(): AgentTool {
  return {
    name: "grep",
    definition: {
      type: "function",
      function: {
        name: "grep",
        description: "Search file contents for a regex pattern.",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Regex pattern" },
            directory: { type: "string", description: "Directory to search (default: home)" },
            include: { type: "string", description: "File glob filter (e.g., '*.ts')" },
            maxResults: { type: "number", description: "Max matches (default: 50)" },
          },
          required: ["pattern"],
        },
      },
    },
    execute: async (args) => {
      const dir = resolvePath(args.directory as string);
      const pattern = args.pattern as string;
      const include = args.include as string | undefined;
      const max = (args.maxResults as number) ?? 50;
      const includeFlag = include ? `--include=${JSON.stringify(include)}` : "";
      try {
        const stdout = execSync(
          `grep -rn ${includeFlag} -m ${max} ${JSON.stringify(pattern)} ${JSON.stringify(dir)} 2>/dev/null | head -n ${max}`,
          { encoding: "utf-8", timeout: 10000 },
        );
        return { matches: stdout.trim().split("\n").filter(Boolean) };
      } catch {
        return { matches: [] };
      }
    },
  };
}

export function createCodebaseSearchTool(): AgentTool {
  return {
    name: "codebase_search",
    definition: {
      type: "function",
      function: {
        name: "codebase_search",
        description: "Search code with surrounding context. Returns matches grouped by file.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search string or regex" },
            directory: { type: "string", description: "Directory to search" },
            fileFilter: { type: "string", description: "File extension (e.g., 'ts', 'py')" },
            maxResults: { type: "number", description: "Max file matches (default: 10)" },
          },
          required: ["query", "directory"],
        },
      },
    },
    execute: async (args) => {
      const dir = resolvePath(args.directory as string);
      const query = args.query as string;
      const ext = args.fileFilter as string | undefined;
      const max = (args.maxResults as number) ?? 10;
      const includeFlag = ext ? `--include="*.${ext}"` : "";
      try {
        const raw = execSync(
          `grep -rn ${includeFlag} -B 3 -A 3 ${JSON.stringify(query)} ${JSON.stringify(dir)} 2>/dev/null | head -n 300`,
          { encoding: "utf-8", timeout: 15000 },
        ).trim();
        const groups: Record<string, string[]> = {};
        let fileCount = 0;
        for (const line of raw.split("\n")) {
          const sep = line.indexOf(":");
          if (sep === -1) continue;
          const file = line.startsWith("--") ? "--" : line.substring(0, sep);
          if (file === "--") continue;
          if (!groups[file]) {
            fileCount++;
            if (fileCount > max) break;
            groups[file] = [];
          }
          groups[file]!.push(line.substring(sep + 1));
        }
        const results = Object.entries(groups).map(([file, lines]) => ({
          file: file.replace(dir + "/", ""),
          matches: lines.join("\n"),
        }));
        return { query, directory: dir, totalFiles: results.length, results };
      } catch {
        return { query, directory: dir, totalFiles: 0, results: [] };
      }
    },
  };
}
