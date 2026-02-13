import { randomUUID } from "node:crypto";
import type {
  Connector,
  NodeInfo,
  InvokeResult,
  ExecResult,
  ExecOptions,
  WebSocketConnectorConfig,
} from "./types.js";

type PendingRequest = {
  resolve: (value: InvokeResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class WebSocketConnector implements Connector {
  readonly type = "websocket" as const;
  readonly nodeId: string;
  readonly displayName: string;
  private url: string;
  private token?: string;
  private ws: WebSocket | null = null;
  private _connected = false;
  private connectedAt?: number;
  private pendingRequests = new Map<string, PendingRequest>();
  private remotePlatform?: string;
  private remoteCapabilities: string[] = [];
  private remoteCommands: string[] = [];

  constructor(config: WebSocketConnectorConfig) {
    this.url = config.url;
    this.token = config.token;
    this.nodeId = `ws-${new URL(config.url).host}`.replace(/\W/g, "-");
    this.displayName = config.displayName ?? `WebSocket ${new URL(config.url).host}`;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {};
      if (this.token) headers.Authorization = `Bearer ${this.token}`;

      const ws = new WebSocket(this.url, { headers } as unknown as string[]);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`WebSocket connection timeout: ${this.url}`));
      }, 15_000);

      ws.addEventListener("open", () => {
        clearTimeout(timeout);
        this.ws = ws;
        this._connected = true;
        this.connectedAt = Date.now();
        ws.send(JSON.stringify({
          type: "hello",
          clientName: "undoable",
          clientVersion: "1.0.0",
          token: this.token,
        }));
        resolve();
      });

      ws.addEventListener("message", (event) => {
        this.handleMessage(typeof event.data === "string" ? event.data : event.data.toString());
      });

      ws.addEventListener("close", () => {
        this._connected = false;
        this.ws = null;
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timer);
          pending.resolve({ ok: false, error: { code: "DISCONNECTED", message: "connection closed" } });
          this.pendingRequests.delete(id);
        }
      });

      ws.addEventListener("error", (err) => {
        clearTimeout(timeout);
        if (!this._connected) {
          reject(new Error(`WebSocket error: ${(err as ErrorEvent).message ?? "connection failed"}`));
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected && this.ws !== null;
  }

  info(): NodeInfo {
    return {
      nodeId: this.nodeId,
      connectorType: "websocket",
      displayName: this.displayName,
      platform: this.remotePlatform,
      capabilities: this.remoteCapabilities.length > 0 ? this.remoteCapabilities : ["exec", "invoke"],
      commands: this.remoteCommands.length > 0 ? this.remoteCommands : ["system.run"],
      connected: this._connected,
      connectedAt: this.connectedAt,
      meta: { url: this.url },
    };
  }

  private handleMessage(raw: string) {
    try {
      const msg = JSON.parse(raw) as Record<string, unknown>;
      const type = msg.type as string;

      if (type === "hello_ok" || type === "hello") {
        this.remotePlatform = msg.platform as string | undefined;
        this.remoteCapabilities = (msg.capabilities as string[]) ?? [];
        this.remoteCommands = (msg.commands as string[]) ?? [];
        return;
      }

      if (type === "response" || type === "invoke_result") {
        const id = msg.id as string;
        const pending = this.pendingRequests.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(id);
          pending.resolve({
            ok: (msg.ok as boolean) ?? true,
            payload: msg.payload,
            error: msg.error as InvokeResult["error"],
          });
        }
      }
    } catch { }
  }

  async exec(command: string, opts?: ExecOptions): Promise<ExecResult> {
    const result = await this.invoke("system.run", {
      command,
      cwd: opts?.cwd,
      env: opts?.env,
      timeoutMs: opts?.timeout,
    });
    if (!result.ok) {
      return {
        exitCode: null,
        stdout: "",
        stderr: result.error?.message ?? "invoke failed",
        durationMs: 0,
      };
    }
    const payload = result.payload as Record<string, unknown> | undefined;
    return {
      exitCode: (payload?.exitCode as number) ?? null,
      stdout: (payload?.stdout as string) ?? "",
      stderr: (payload?.stderr as string) ?? "",
      durationMs: (payload?.durationMs as number) ?? 0,
    };
  }

  async invoke(command: string, params?: unknown): Promise<InvokeResult> {
    if (!this.ws || !this._connected) {
      return { ok: false, error: { code: "NOT_CONNECTED", message: "not connected" } };
    }

    const id = randomUUID();
    const timeoutMs = 30_000;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve({ ok: false, error: { code: "TIMEOUT", message: `invoke timed out after ${timeoutMs}ms` } });
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, timer });

      this.ws!.send(JSON.stringify({
        type: "invoke",
        id,
        command,
        params,
      }));
    });
  }
}
