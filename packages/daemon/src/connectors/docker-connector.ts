import { spawn } from "node:child_process";
import type {
  Connector,
  NodeInfo,
  InvokeResult,
  ExecResult,
  ExecOptions,
  DockerConnectorConfig,
} from "./types.js";

export class DockerConnector implements Connector {
  readonly type = "docker" as const;
  readonly nodeId: string;
  readonly displayName: string;
  private container: string;
  private image?: string;
  private _connected = false;
  private platform?: string;

  constructor(config: DockerConnectorConfig) {
    this.container = config.container;
    this.image = config.image;
    this.nodeId = `docker-${config.container}`.replace(/\W/g, "-");
    this.displayName = config.displayName ?? `Docker ${config.container}`;
  }

  async connect(): Promise<void> {
    const result = await this.rawExec("uname -a", 10_000);
    if (result.exitCode !== 0) {
      if (this.image) {
        const startResult = await this.startContainer();
        if (startResult.exitCode !== 0) {
          throw new Error(`Failed to start container: ${startResult.stderr}`);
        }
        const retryResult = await this.rawExec("uname -a", 10_000);
        if (retryResult.exitCode !== 0) {
          throw new Error(`Docker container unreachable: ${retryResult.stderr}`);
        }
        this.platform = retryResult.stdout.trim().split("\n")[0];
      } else {
        throw new Error(`Docker container '${this.container}' not running: ${result.stderr}`);
      }
    } else {
      this.platform = result.stdout.trim().split("\n")[0];
    }
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  info(): NodeInfo {
    return {
      nodeId: this.nodeId,
      connectorType: "docker",
      displayName: this.displayName,
      platform: this.platform,
      capabilities: ["exec", "fs", "isolated"],
      commands: ["system.run", "system.info"],
      connected: this._connected,
      meta: { container: this.container, image: this.image },
    };
  }

  private startContainer(): Promise<ExecResult> {
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const args = [
        "run", "-d", "--name", this.container,
        "--entrypoint", "sleep",
        this.image!,
        "infinity",
      ];
      let stdout = "";
      let stderr = "";
      const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"], timeout: 30_000 });
      child.stdout?.on("data", (d) => { stdout += d.toString(); });
      child.stderr?.on("data", (d) => { stderr += d.toString(); });
      child.on("close", (code) => resolve({ exitCode: code, stdout, stderr, durationMs: Date.now() - startedAt }));
      child.on("error", (err) => resolve({ exitCode: null, stdout: "", stderr: err.message, durationMs: Date.now() - startedAt }));
    });
  }

  private rawExec(command: string, timeout: number): Promise<ExecResult> {
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const args = ["exec", this.container, "sh", "-c", command];
      let stdout = "";
      let stderr = "";
      const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"], timeout });
      child.stdout?.on("data", (d) => { stdout += d.toString(); });
      child.stderr?.on("data", (d) => { stderr += d.toString(); });
      child.on("close", (code) => resolve({ exitCode: code, stdout, stderr, durationMs: Date.now() - startedAt }));
      child.on("error", (err) => resolve({ exitCode: null, stdout: "", stderr: err.message, durationMs: Date.now() - startedAt }));
    });
  }

  async exec(command: string, opts?: ExecOptions): Promise<ExecResult> {
    const timeout = opts?.timeout ?? 30_000;
    let cmd = command;
    if (opts?.cwd) cmd = `cd ${JSON.stringify(opts.cwd)} && ${cmd}`;
    if (opts?.env && Object.keys(opts.env).length > 0) {
      const envPrefix = Object.entries(opts.env)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ");
      cmd = `${envPrefix} ${cmd}`;
    }
    const result = await this.rawExec(cmd, timeout);
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.slice(0, 50_000),
      stderr: result.stderr.slice(0, 50_000),
      durationMs: result.durationMs,
    };
  }

  async invoke(command: string, params?: unknown): Promise<InvokeResult> {
    switch (command) {
      case "system.run": {
        const p = (params as Record<string, unknown>) ?? {};
        const result = await this.exec(p.command as string, {
          cwd: p.cwd as string | undefined,
          timeout: p.timeoutMs as number | undefined,
          env: p.env as Record<string, string> | undefined,
        });
        return { ok: result.exitCode === 0, payload: result };
      }
      case "system.info": {
        const result = await this.exec("cat /etc/os-release 2>/dev/null || uname -a", { timeout: 10_000 });
        return { ok: result.exitCode === 0, payload: { raw: result.stdout.trim() } };
      }
      default:
        return { ok: false, error: { code: "UNSUPPORTED", message: `Unknown command: ${command}` } };
    }
  }
}
