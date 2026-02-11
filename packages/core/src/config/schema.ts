import type { UndoableConfig } from "./types.js";

export const DEFAULT_CONFIG: UndoableConfig = {
  daemon: {
    host: "127.0.0.1",
    port: 7433,
    jwtSecret: "",
  },
  database: {
    url: "postgres://localhost:5432/undoable",
  },
  sandbox: {
    image: "undoable-sandbox:latest",
    defaultNetwork: "none",
    memoryMb: 512,
    cpus: 1,
    timeoutSeconds: 300,
  },
  llm: {
    defaultProvider: "manual",
    providers: {},
  },
  logging: {
    level: "info",
    format: "pretty",
  },
  agents: {
    default: {
      default: true,
    },
  },
};

export function validateConfig(raw: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (raw.daemon && typeof raw.daemon === "object") {
    const d = raw.daemon as Record<string, unknown>;
    if (d.port !== undefined && (typeof d.port !== "number" || d.port < 1 || d.port > 65535)) {
      errors.push("daemon.port must be a number between 1 and 65535");
    }
    if (d.host !== undefined && typeof d.host !== "string") {
      errors.push("daemon.host must be a string");
    }
  }

  if (raw.sandbox && typeof raw.sandbox === "object") {
    const s = raw.sandbox as Record<string, unknown>;
    if (s.memoryMb !== undefined && (typeof s.memoryMb !== "number" || s.memoryMb < 64)) {
      errors.push("sandbox.memoryMb must be a number >= 64");
    }
    if (s.cpus !== undefined && (typeof s.cpus !== "number" || s.cpus < 0.5)) {
      errors.push("sandbox.cpus must be a number >= 0.5");
    }
    if (s.defaultNetwork !== undefined && !["none", "restricted", "open"].includes(s.defaultNetwork as string)) {
      errors.push("sandbox.defaultNetwork must be none, restricted, or open");
    }
  }

  if (raw.logging && typeof raw.logging === "object") {
    const l = raw.logging as Record<string, unknown>;
    if (l.level !== undefined && !["debug", "info", "warn", "error", "silent"].includes(l.level as string)) {
      errors.push("logging.level must be debug, info, warn, error, or silent");
    }
    if (l.format !== undefined && !["json", "pretty"].includes(l.format as string)) {
      errors.push("logging.format must be json or pretty");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function mergeConfig(base: UndoableConfig, override: Record<string, unknown>): UndoableConfig {
  const result = structuredClone(base);

  if (override.daemon && typeof override.daemon === "object") {
    Object.assign(result.daemon, override.daemon);
  }
  if (override.database && typeof override.database === "object") {
    Object.assign(result.database, override.database);
  }
  if (override.sandbox && typeof override.sandbox === "object") {
    Object.assign(result.sandbox, override.sandbox);
  }
  if (override.llm && typeof override.llm === "object") {
    const llm = override.llm as Record<string, unknown>;
    if (llm.defaultProvider) result.llm.defaultProvider = llm.defaultProvider as string;
    if (llm.providers && typeof llm.providers === "object") {
      Object.assign(result.llm.providers, llm.providers);
    }
  }
  if (override.logging && typeof override.logging === "object") {
    Object.assign(result.logging, override.logging);
  }
  if (override.agents && typeof override.agents === "object") {
    Object.assign(result.agents, override.agents);
  }

  return result;
}
