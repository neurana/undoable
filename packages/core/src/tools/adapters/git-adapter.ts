import { execFile } from "node:child_process";
import type { ToolAdapter, ToolExecuteParams, ToolResult } from "../types.js";

type GitAction = "status" | "diff" | "add" | "commit" | "branch" | "checkout" | "log" | "patch" | "apply";

export class GitAdapter implements ToolAdapter {
  readonly id = "git";
  readonly description = "Git operations (status, diff, commit, branch, patch)";
  readonly requiredCapabilityPrefix = "git";

  async execute(params: ToolExecuteParams): Promise<ToolResult> {
    const action = params.params.action as GitAction;
    const cwd = params.workingDir;

    switch (action) {
      case "status":
        return this.git(cwd, ["status", "--porcelain"]);
      case "diff":
        return this.git(cwd, ["diff", ...(params.params.staged ? ["--cached"] : [])]);
      case "add": {
        const files = (params.params.files as string[]) ?? ["."];
        return this.git(cwd, ["add", ...files]);
      }
      case "commit":
        return this.git(cwd, ["commit", "-m", params.params.message as string]);
      case "branch":
        return this.git(cwd, ["branch", ...(params.params.name ? [params.params.name as string] : [])]);
      case "checkout":
        return this.git(cwd, ["checkout", params.params.ref as string]);
      case "log": {
        const n = (params.params.count as number) ?? 10;
        return this.git(cwd, ["log", `--max-count=${n}`, "--oneline"]);
      }
      case "patch":
        return this.git(cwd, ["diff", "--cached", "--binary"]);
      case "apply":
        return this.gitStdin(cwd, ["apply", "--cached"], params.params.patch as string);
      default:
        return { success: false, output: "", error: `Unknown git action: ${action}` };
    }
  }

  validate(params: Record<string, unknown>): boolean {
    return typeof params.action === "string";
  }

  estimateCapabilities(params: Record<string, unknown>): string[] {
    const action = params.action as string;
    if (["status", "diff", "log"].includes(action)) {
      return ["git.read:*"];
    }
    return ["git.write:*"];
  }

  private git(cwd: string, args: string[]): Promise<ToolResult> {
    return new Promise((resolve) => {
      execFile("git", args, { cwd, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, output: stdout, error: stderr || error.message });
          return;
        }
        resolve({ success: true, output: stdout, metadata: { stderr } });
      });
    });
  }

  private gitStdin(cwd: string, args: string[], stdin: string): Promise<ToolResult> {
    return new Promise((resolve) => {
      const proc = execFile("git", args, { cwd, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, output: stdout, error: stderr || error.message });
          return;
        }
        resolve({ success: true, output: stdout, metadata: { stderr } });
      });
      proc.stdin?.write(stdin);
      proc.stdin?.end();
    });
  }
}
