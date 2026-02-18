import { spawn } from "node:child_process";
import os from "node:os";
import type {
  Connector,
  NodeInfo,
  InvokeResult,
  ExecResult,
  ExecOptions,
  LocalConnectorConfig,
} from "./types.js";

export class LocalConnector implements Connector {
  readonly type = "local" as const;
  readonly nodeId: string;
  readonly displayName: string;
  private _connected = false;

  constructor(config: LocalConnectorConfig) {
    this.nodeId = `local-${os.hostname().replace(/\W/g, "-").toLowerCase()}`;
    this.displayName = config.displayName ?? `Local (${os.hostname()})`;
  }

  async connect(): Promise<void> {
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
      connectorType: "local",
      displayName: this.displayName,
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      capabilities: ["exec", "fs", "env"],
      commands: ["system.run", "system.info"],
      connected: this._connected,
      connectedAt: Date.now(),
    };
  }

  private safeUptime(): number | null {
    try {
      return os.uptime();
    } catch {
      return null;
    }
  }

  async exec(command: string, opts?: ExecOptions): Promise<ExecResult> {
    const cwd = opts?.cwd ?? os.homedir();
    const timeout = opts?.timeout ?? 30_000;
    const env = opts?.env ? { ...process.env, ...opts.env } : process.env;
    const shell = process.env.SHELL || "/bin/bash";
    const startedAt = Date.now();

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      const child = spawn(shell, ["-c", command], {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        timeout,
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
        });
        return { ok: result.exitCode === 0, payload: result };
      }
      case "system.info":
        return {
          ok: true,
          payload: {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            release: os.release(),
            cpus: os.cpus().length,
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            uptime: this.safeUptime(),
            homeDir: os.homedir(),
            shell: process.env.SHELL,
            nodeVersion: process.version,
          },
        };
      default:
        return { ok: false, error: { code: "UNSUPPORTED", message: `Unknown command: ${command}` } };
    }
  }
}
