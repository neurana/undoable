export type UndoableConfig = {
  daemon: {
    host: string;
    port: number;
    jwtSecret: string;
  };
  database: {
    url: string;
  };
  sandbox: {
    image: string;
    defaultNetwork: "none" | "restricted" | "open";
    memoryMb: number;
    cpus: number;
    timeoutSeconds: number;
  };
  llm: {
    defaultProvider: string;
    providers: Record<string, LLMProviderEntry>;
  };
  logging: {
    level: LogLevel;
    format: "json" | "pretty";
  };
  agents: Record<string, AgentEntry>;
};

export type LLMProviderEntry = {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
};

export type AgentEntry = {
  model?: string;
  provider?: string;
  capabilities?: string[];
  default?: boolean;
};

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export type ConfigSource = "global" | "project" | "env" | "default";
