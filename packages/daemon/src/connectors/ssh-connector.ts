import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import type {
  Connector,
  NodeInfo,
  InvokeResult,
  ExecResult,
  ExecOptions,
  SSHConnectorConfig,
} from "./types.js";

export class SSHConnector implements Connector {
  readonly type = "ssh" as const;
  readonly nodeId: string;
  readonly displayName: string;
  private _connected = false;
  private host: string;
  private port: number;
  private username: string;
  private keyPath?: string;
  private password?: string;
  private platform?: string;

  constructor(config: SSHConnectorConfig) {
    this.host = config.host;
    this.port = config.port ?? 22;
    this.username = config.username;
    this.keyPath = config.privateKeyPath;
    this.password = config.password;
    this.nodeId = `ssh-${config.username}@${config.host}`.replace(/\W/g, "-");
    this.displayName = config.displayName ?? `SSH ${config.username}@${config.host}`;
  }

  async connect(): Promise<void> {
    const result = await this.exec("uname -a", { timeout: 10_000 });
    if (result.exitCode !== 0) {
      throw new Error(`SSH connection failed: ${result.stderr || "unreachable"}`);
    }
    this.platform = result.stdout.trim().split("\n")[0];
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
      connectorType: "ssh",
      displayName: this.displayName,
      platform: this.platform,
      capabilities: ["exec", "fs"],
      commands: ["system.run", "system.info"],
      connected: this._connected,
      meta: { host: this.host, port: this.port, username: this.username },
    };
  }

  private buildSshArgs(): string[] {
    const args = [
      "-o", "StrictHostKeyChecking=accept-new",
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
      "-p", String(this.port),
    ];
    if (this.keyPath) {
      const resolved = this.keyPath.startsWith("~")
        ? path.join(os.homedir(), this.keyPath.slice(1))
        : this.keyPath;
      args.push("-i", resolved);
    }
    args.push(`${this.username}@${this.host}`);
    return args;
  }

  async exec(command: string, opts?: ExecOptions): Promise<ExecResult> {
    const timeout = opts?.timeout ?? 30_000;
    const startedAt = Date.now();

    let remoteCmd = command;
    if (opts?.cwd) {
      remoteCmd = `cd ${JSON.stringify(opts.cwd)} && ${command}`;
    }
    if (opts?.env && Object.keys(opts.env).length > 0) {
      const envPrefix = Object.entries(opts.env)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ");
      remoteCmd = `${envPrefix} ${remoteCmd}`;
    }

    const sshArgs = [...this.buildSshArgs(), remoteCmd];

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";

      const child = spawn("ssh", sshArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        timeout,
        env: this.password
          ? { ...process.env, SSH_ASKPASS_REQUIRE: "never" }
          : process.env,
      });

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        resolve({
          exitCode: code,
          stdout: stdout.slice(0, 50_000),
          stderr: stderr.slice(0, 50_000),
          durationMs: Date.now() - startedAt,
        });
      });

      child.on("error", (err) => {
        resolve({
          exitCode: null,
          stdout: "",
          stderr: err.message,
          durationMs: Date.now() - startedAt,
        });
      });
    });
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
        const result = await this.exec(
          "echo '{\"hostname\":\"'$(hostname)'\",\"platform\":\"'$(uname -s)'\",\"arch\":\"'$(uname -m)'\",\"uptime\":'$(cat /proc/uptime 2>/dev/null | cut -d' ' -f1 || echo 0)'}'",
          { timeout: 10_000 },
        );
        if (result.exitCode === 0) {
          try {
            return { ok: true, payload: JSON.parse(result.stdout) };
          } catch {
            return { ok: true, payload: { raw: result.stdout.trim() } };
          }
        }
        return { ok: false, error: { message: result.stderr } };
      }
      default:
        return { ok: false, error: { code: "UNSUPPORTED", message: `Unknown command: ${command}` } };
    }
  }
}
