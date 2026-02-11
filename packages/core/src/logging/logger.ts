import type { LogLevel } from "../config/types.js";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export type LogEntry = {
  level: LogLevel;
  subsystem: string;
  message: string;
  data?: Record<string, unknown>;
  ts: string;
};

export type LogOutput = (entry: LogEntry) => void;

export class Logger {
  private subsystem: string;
  private level: LogLevel;
  private output: LogOutput;

  constructor(subsystem: string, level: LogLevel = "info", output?: LogOutput) {
    this.subsystem = subsystem;
    this.level = level;
    this.output = output ?? defaultOutput;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log("error", message, data);
  }

  child(subsystem: string): Logger {
    return new Logger(`${this.subsystem}:${subsystem}`, this.level, this.output);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) return;
    this.output({
      level,
      subsystem: this.subsystem,
      message,
      data,
      ts: new Date().toISOString(),
    });
  }
}

function defaultOutput(entry: LogEntry): void {
  const prefix = `[${entry.ts}] [${entry.level.toUpperCase()}] [${entry.subsystem}]`;
  const msg = entry.data ? `${entry.message} ${JSON.stringify(entry.data)}` : entry.message;
  if (entry.level === "error") {
    console.error(`${prefix} ${msg}`);
  } else if (entry.level === "warn") {
    console.warn(`${prefix} ${msg}`);
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

export function createLogger(subsystem: string, level?: LogLevel, output?: LogOutput): Logger {
  return new Logger(subsystem, level, output);
}
