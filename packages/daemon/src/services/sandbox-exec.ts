import { SandboxOrchestrator, type SandboxConfig } from "@undoable/sandbox";
import type { ExecResult } from "@undoable/sandbox";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const DOCKER_SOCKET = "/var/run/docker.sock";

type SandboxNetworkMode = "none" | "restricted" | "open";

type SandboxSecurityProfile = {
  networkMode: SandboxNetworkMode;
  allowedHosts?: string[];
  readOnlyMounts: Array<{ host: string; container: string }>;
};

function parseNetworkMode(value: string | undefined): SandboxNetworkMode {
  const normalized = (value ?? "restricted").trim().toLowerCase();
  if (normalized === "none" || normalized === "restricted" || normalized === "open") {
    return normalized;
  }
  return "restricted";
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseReadOnlyMounts(value: string | undefined): Array<{ host: string; container: string }> {
  const entries = parseCsv(value);
  const mounts: Array<{ host: string; container: string }> = [];

  for (const entry of entries) {
    const [hostRaw, containerRaw] = entry.split(":");
    const host = hostRaw?.trim();
    const container = containerRaw?.trim();
    if (!host || !container) continue;
    mounts.push({ host: path.resolve(host), container });
  }

  return mounts;
}

function resolveSecurityProfile(): SandboxSecurityProfile {
  const networkMode = parseNetworkMode(process.env.UNDOABLE_SANDBOX_NETWORK_MODE);
  const allowedHosts = parseCsv(process.env.UNDOABLE_SANDBOX_ALLOWED_HOSTS);
  const readOnlyMounts = parseReadOnlyMounts(process.env.UNDOABLE_SANDBOX_READONLY_MOUNTS);

  return {
    networkMode,
    allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined,
    readOnlyMounts,
  };
}

export type SandboxExecOptions = {
  command: string;
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
};

export class SandboxExecService {
  private orchestrator = new SandboxOrchestrator();
  private _available: boolean | null = null;
  private readonly profile = resolveSecurityProfile();

  get available(): boolean {
    if (this._available === null) {
      this._available = fs.existsSync(DOCKER_SOCKET);
    }
    return this._available;
  }

  async ensureSandbox(sessionId: string, workspacePath?: string): Promise<void> {
    if (this.orchestrator.hasSession(sessionId)) return;

    const resolvedWorkspace = path.resolve(workspacePath ?? os.homedir());

    const config: SandboxConfig = {
      workspacePath: resolvedWorkspace,
      networkPolicy: {
        mode: this.profile.networkMode,
        ...(this.profile.allowedHosts ? { allowedHosts: this.profile.allowedHosts } : {}),
      },
      ...(this.profile.readOnlyMounts.length > 0 ? { readOnlyMounts: this.profile.readOnlyMounts } : {}),
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
