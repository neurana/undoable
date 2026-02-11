import { ContainerManager } from "./manager.js";
import { createWorkspaceMount, createReadOnlyMount } from "../workspace/mount.js";
import { resolveNetworkMode, type NetworkPolicy } from "../network/policy.js";
import type { ContainerConfig, ExecResult } from "./types.js";
import type { ResourceLimits } from "@undoable/shared";

export type SandboxConfig = {
  image?: string;
  workspacePath: string;
  networkPolicy?: NetworkPolicy;
  resourceLimits?: ResourceLimits;
  env?: Record<string, string>;
  readOnlyMounts?: Array<{ host: string; container: string }>;
  timeoutMs?: number;
};

export type SandboxSession = {
  containerId: string;
  workspacePath: string;
  config: SandboxConfig;
  createdAt: string;
};

const DEFAULT_IMAGE = "undoable-sandbox:latest";
const DEFAULT_TIMEOUT = 300_000;

export class SandboxOrchestrator {
  private manager: ContainerManager;
  private sessions = new Map<string, SandboxSession>();

  constructor(manager?: ContainerManager) {
    this.manager = manager ?? new ContainerManager();
  }

  async createSandbox(runId: string, config: SandboxConfig): Promise<SandboxSession> {
    const mounts = [createWorkspaceMount(config.workspacePath)];
    if (config.readOnlyMounts) {
      for (const m of config.readOnlyMounts) {
        mounts.push(createReadOnlyMount(m.host, m.container));
      }
    }

    const networkMode = resolveNetworkMode(config.networkPolicy ?? { mode: "none" });

    const containerConfig: ContainerConfig = {
      image: config.image ?? DEFAULT_IMAGE,
      workingDir: "/workspace",
      networkMode,
      resourceLimits: config.resourceLimits,
      env: config.env,
      mounts,
    };

    const containerId = await this.manager.create(containerConfig);
    await this.manager.start(containerId);

    const session: SandboxSession = {
      containerId,
      workspacePath: config.workspacePath,
      config,
      createdAt: new Date().toISOString(),
    };

    this.sessions.set(runId, session);
    return session;
  }

  async exec(runId: string, cmd: string[]): Promise<ExecResult> {
    const session = this.getSession(runId);
    const timeout = session.config.timeoutMs ?? DEFAULT_TIMEOUT;

    return Promise.race([
      this.manager.exec(session.containerId, cmd),
      new Promise<ExecResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Sandbox exec timed out after ${timeout}ms`)), timeout),
      ),
    ]);
  }

  async extractDiff(runId: string): Promise<string> {
    const result = await this.exec(runId, [
      "git", "diff", "--no-color",
    ]);
    if (result.exitCode !== 0) {
      const untrackedResult = await this.exec(runId, [
        "git", "status", "--porcelain",
      ]);
      return untrackedResult.stdout;
    }
    return result.stdout;
  }

  async destroySandbox(runId: string): Promise<void> {
    const session = this.sessions.get(runId);
    if (!session) return;

    await this.manager.stop(session.containerId).catch(() => {});
    await this.manager.remove(session.containerId).catch(() => {});
    this.sessions.delete(runId);
  }

  async isRunning(runId: string): Promise<boolean> {
    const session = this.sessions.get(runId);
    if (!session) return false;
    const status = await this.manager.status(session.containerId);
    return status.running;
  }

  getSession(runId: string): SandboxSession {
    const session = this.sessions.get(runId);
    if (!session) throw new Error(`No sandbox session for run: ${runId}`);
    return session;
  }

  hasSession(runId: string): boolean {
    return this.sessions.has(runId);
  }
}
