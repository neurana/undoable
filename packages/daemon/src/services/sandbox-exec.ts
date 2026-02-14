import { SandboxOrchestrator, type SandboxConfig } from "@undoable/sandbox";
import type { ExecResult } from "@undoable/sandbox";
import os from "node:os";
import fs from "node:fs";

const DOCKER_SOCKET = "/var/run/docker.sock";

export type SandboxExecOptions = {
  command: string;
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
};

export class SandboxExecService {
  private orchestrator = new SandboxOrchestrator();
  private _available: boolean | null = null;

  get available(): boolean {
    if (this._available === null) {
      this._available = fs.existsSync(DOCKER_SOCKET);
    }
    return this._available;
  }

  async ensureSandbox(sessionId: string, workspacePath?: string): Promise<void> {
    if (this.orchestrator.hasSession(sessionId)) return;

    const config: SandboxConfig = {
      workspacePath: workspacePath ?? os.homedir(),
      networkPolicy: { mode: "open" },
      timeoutMs: 300_000,
    };

    await this.orchestrator.createSandbox(sessionId, config);
  }

  async exec(sessionId: string, opts: SandboxExecOptions): Promise<ExecResult> {
    const parts = ["sh", "-c"];
    let cmd = opts.command;
    if (opts.cwd) cmd = `cd ${JSON.stringify(opts.cwd)} && ${cmd}`;
    if (opts.env && Object.keys(opts.env).length > 0) {
      const prefix = Object.entries(opts.env)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ");
      cmd = `${prefix} ${cmd}`;
    }
    parts.push(cmd);

    return this.orchestrator.exec(sessionId, parts);
  }

  async destroy(sessionId: string): Promise<void> {
    await this.orchestrator.destroySandbox(sessionId);
  }

  async isRunning(sessionId: string): Promise<boolean> {
    return this.orchestrator.isRunning(sessionId);
  }
}
