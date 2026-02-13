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

export function createProjectInfoTool(): AgentTool {
  return {
    name: "project_info",
    definition: {
      type: "function",
      function: {
        name: "project_info",
        description: "Analyze a project directory. Returns directory tree, detected language/framework, config files, README, and git status.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Project root directory path" },
          },
          required: ["path"],
        },
      },
    },
    execute: async (args) => {
      const dir = resolvePath(args.path as string);
      const result: Record<string, unknown> = { path: dir };
      try {
        const tree = execSync(
          `find ${JSON.stringify(dir)} -maxdepth 3 -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/.next/*' | head -n 120`,
          { encoding: "utf-8", timeout: 10000 },
        ).trim();
        result.tree = tree.split("\n").map((l) => l.replace(dir, "."));
      } catch {
        result.tree = [];
      }
      const configFiles: Record<string, string> = {};
      const keyFiles = [
        "package.json", "tsconfig.json", "Cargo.toml", "pyproject.toml",
        "go.mod", "Gemfile", "pom.xml", "build.gradle", "Makefile",
        "docker-compose.yml", "Dockerfile", ".env.example",
      ];
      for (const f of keyFiles) {
        try {
          const content = execSync(`cat ${JSON.stringify(path.join(dir, f))} 2>/dev/null`, {
            encoding: "utf-8", timeout: 5000, maxBuffer: 1024 * 1024,
          });
          configFiles[f] = content.slice(0, 2000);
        } catch { }
      }
      result.configFiles = configFiles;
      const detected: string[] = [];
      if (configFiles["package.json"]) {
        detected.push("node");
        const pkg = configFiles["package.json"];
        if (pkg.includes("react")) detected.push("react");
        if (pkg.includes("next")) detected.push("nextjs");
        if (pkg.includes("vue")) detected.push("vue");
        if (pkg.includes("svelte")) detected.push("svelte");
        if (pkg.includes("lit")) detected.push("lit");
        if (pkg.includes("express")) detected.push("express");
        if (pkg.includes("fastify")) detected.push("fastify");
      }
      if (configFiles["tsconfig.json"]) detected.push("typescript");
      if (configFiles["Cargo.toml"]) detected.push("rust");
      if (configFiles["pyproject.toml"]) detected.push("python");
      if (configFiles["go.mod"]) detected.push("go");
      result.detected = detected;
      for (const readme of ["README.md", "readme.md", "README.rst", "README"]) {
        try {
          const content = execSync(`cat ${JSON.stringify(path.join(dir, readme))} 2>/dev/null`, {
            encoding: "utf-8", timeout: 5000, maxBuffer: 1024 * 1024,
          });
          result.readme = content.slice(0, 3000);
          break;
        } catch { }
      }
      try {
        const gitBranch = execSync("git branch --show-current", { cwd: dir, encoding: "utf-8", timeout: 5000 }).trim();
        const gitStatus = execSync("git status --short", { cwd: dir, encoding: "utf-8", timeout: 5000 }).trim();
        result.git = { branch: gitBranch, changes: gitStatus.split("\n").filter(Boolean).slice(0, 30) };
      } catch { }
      return result;
    },
  };
}

export function createFileInfoTool(): AgentTool {
  return {
    name: "file_info",
    definition: {
      type: "function",
      function: {
        name: "file_info",
        description: "Read and analyze a file. Returns content, language, size, and code structure (functions, classes, exports).",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path" },
          },
          required: ["path"],
        },
      },
    },
    execute: async (args) => {
      const filePath = resolvePath(args.path as string);
      try {
        const sizeStr = execSync(
          `stat -f%z ${JSON.stringify(filePath)} 2>/dev/null || stat -c%s ${JSON.stringify(filePath)} 2>/dev/null`,
          { encoding: "utf-8", timeout: 5000 },
        ).trim();
        const sizeBytes = Number.parseInt(sizeStr, 10) || 0;
        const content = execSync(`cat ${JSON.stringify(filePath)}`, {
          encoding: "utf-8", timeout: 10000, maxBuffer: 2 * 1024 * 1024,
        });
        const lines = content.split("\n");
        const ext = path.extname(filePath).slice(1);
        const langMap: Record<string, string> = {
          ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
          py: "python", rs: "rust", go: "go", rb: "ruby", java: "java",
          c: "c", cpp: "cpp", h: "c-header", cs: "csharp",
          md: "markdown", json: "json", yaml: "yaml", yml: "yaml",
          html: "html", css: "css", scss: "scss", sh: "bash",
          sql: "sql", toml: "toml", xml: "xml",
        };
        const language = langMap[ext] ?? ext;
        const structure: Record<string, string[]> = {};
        if (["typescript", "javascript"].includes(language)) {
          structure.exports = lines.filter((l) => /^export\s/.test(l)).map((l) => l.trim().substring(0, 120));
          structure.imports = lines.filter((l) => /^import\s/.test(l)).map((l) => l.trim().substring(0, 120));
          structure.functions = lines
            .filter((l) => /(?:function\s+\w|const\s+\w+\s*=\s*(?:async\s*)?\()/.test(l))
            .map((l) => l.trim().substring(0, 120));
          structure.classes = lines.filter((l) => /^(?:export\s+)?class\s/.test(l)).map((l) => l.trim().substring(0, 120));
        } else if (language === "python") {
          structure.functions = lines.filter((l) => /^(?:async\s+)?def\s/.test(l)).map((l) => l.trim().substring(0, 120));
          structure.classes = lines.filter((l) => /^class\s/.test(l)).map((l) => l.trim().substring(0, 120));
          structure.imports = lines.filter((l) => /^(?:import|from)\s/.test(l)).map((l) => l.trim().substring(0, 120));
        } else if (language === "rust") {
          structure.functions = lines.filter((l) => /(?:pub\s+)?(?:async\s+)?fn\s/.test(l)).map((l) => l.trim().substring(0, 120));
          structure.structs = lines.filter((l) => /(?:pub\s+)?struct\s/.test(l)).map((l) => l.trim().substring(0, 120));
          structure.imports = lines.filter((l) => /^use\s/.test(l)).map((l) => l.trim().substring(0, 120));
        }
        return {
          path: filePath, language, sizeBytes, totalLines: lines.length,
          content: lines.slice(0, 300).join("\n"),
          truncated: lines.length > 300,
          structure,
        };
      } catch (err) {
        return { path: filePath, error: `Cannot read: ${(err as Error).message}` };
      }
    },
  };
}

export function createSystemInfoTool(): AgentTool {
  return {
    name: "system_info",
    definition: {
      type: "function",
      function: {
        name: "system_info",
        description: "Get a complete system snapshot: OS, CPU, memory, disk, environment, and top processes.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    execute: async () => {
      const mem = os.totalmem();
      const free = os.freemem();
      let disk = "";
      try { disk = execSync("df -h / | tail -1", { encoding: "utf-8", timeout: 5000 }).trim(); } catch { }
      let topProcs = "";
      try {
        topProcs = execSync("ps aux --sort=-%mem | head -11", { encoding: "utf-8", timeout: 5000 }).trim();
      } catch {
        try { topProcs = execSync("ps aux -m | head -11", { encoding: "utf-8", timeout: 5000 }).trim(); } catch { }
      }
      return {
        os: `${os.type()} ${os.release()} (${os.arch()})`,
        hostname: os.hostname(),
        cpus: `${os.cpus().length} cores (${os.cpus()[0]?.model ?? "unknown"})`,
        memory: {
          total: `${(mem / 1024 / 1024 / 1024).toFixed(1)} GB`,
          free: `${(free / 1024 / 1024 / 1024).toFixed(1)} GB`,
          used: `${((mem - free) / 1024 / 1024 / 1024).toFixed(1)} GB`,
          usedPercent: `${(((mem - free) / mem) * 100).toFixed(0)}%`,
        },
        disk,
        uptime: `${(os.uptime() / 3600).toFixed(1)} hours`,
        homeDir: os.homedir(),
        shell: process.env.SHELL ?? "unknown",
        nodeVersion: process.version,
        topProcesses: topProcs,
      };
    },
  };
}
