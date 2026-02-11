import { execFile } from "node:child_process";
import type { ToolAdapter, ToolExecuteParams, ToolResult } from "../types.js";

const DEFAULT_TIMEOUT = 30_000;
const MAX_OUTPUT = 1024 * 1024;

export class ShellAdapter implements ToolAdapter {
  readonly id = "shell";
  readonly description = "Execute shell commands with timeout and capture";
  readonly requiredCapabilityPrefix = "shell.exec";

  async execute(params: ToolExecuteParams): Promise<ToolResult> {
    const command = params.params.command as string;
    const args = (params.params.args as string[] | undefined) ?? [];
    const timeout = (params.params.timeout as number | undefined) ?? DEFAULT_TIMEOUT;
    const cwd = params.workingDir;

    return new Promise((resolve) => {
      const proc = execFile(command, args, {
        cwd,
        timeout,
        maxBuffer: MAX_OUTPUT,
        env: { ...process.env, ...(params.params.env as Record<string, string> | undefined) },
      }, (error, stdout, stderr) => {
        if (error) {
          const timedOut = error.killed || error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
          resolve({
            success: false,
            output: stdout,
            error: timedOut ? `Command timed out after ${timeout}ms` : `Exit code ${proc.exitCode}: ${stderr || error.message}`,
          });
          return;
        }
        resolve({
          success: true,
          output: stdout,
          metadata: { stderr, exitCode: 0 },
        });
      });
    });
  }

  validate(params: Record<string, unknown>): boolean {
    return typeof params.command === "string";
  }

  estimateCapabilities(params: Record<string, unknown>): string[] {
    return [`shell.exec:${params.command}`];
  }
}
