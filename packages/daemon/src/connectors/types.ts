export type ConnectorType = "local" | "ssh" | "docker" | "websocket";

export type NodeInfo = {
  nodeId: string;
  connectorType: ConnectorType;
  displayName: string;
  platform?: string;
  capabilities: string[];
  commands: string[];
  connected: boolean;
  connectedAt?: number;
  meta?: Record<string, unknown>;
};

export type InvokeResult = {
  ok: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string };
};

export type ExecResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type Connector = {
  type: ConnectorType;
  nodeId: string;
  displayName: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  info(): NodeInfo;

  exec(command: string, opts?: ExecOptions): Promise<ExecResult>;
  invoke(command: string, params?: unknown): Promise<InvokeResult>;
};

export type ExecOptions = {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
};

export type ConnectorConfig =
  | LocalConnectorConfig
  | SSHConnectorConfig
  | DockerConnectorConfig
  | WebSocketConnectorConfig;

export type LocalConnectorConfig = {
  type: "local";
  displayName?: string;
};

export type SSHConnectorConfig = {
  type: "ssh";
  host: string;
  port?: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
  displayName?: string;
};

export type DockerConnectorConfig = {
  type: "docker";
  container: string;
  image?: string;
  displayName?: string;
};

export type WebSocketConnectorConfig = {
  type: "websocket";
  url: string;
  token?: string;
  displayName?: string;
};
