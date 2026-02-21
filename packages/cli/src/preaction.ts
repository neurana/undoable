import { Command } from "commander";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isLoopbackDaemonBaseUrl, resolveDaemonBaseUrl } from "./commands/daemon-client.js";

const HOME_STATE_DIR = path.join(os.homedir(), ".undoable");

function setProcessTitle(actionCommand: Command): void {
  const segments: string[] = [];
  let current: Command | null = actionCommand;
  while (current?.parent) {
    segments.unshift(current.name());
    current = current.parent;
  }
  if (segments.length === 0) return;
  process.title = `nrn-${segments.join("-")}`;
}

function ensureStateDir(): void {
  fs.mkdirSync(HOME_STATE_DIR, { recursive: true });
}

function validateRemoteUrlTokenRequirement(opts: Record<string, unknown>): void {
  const url = typeof opts.url === "string" ? opts.url.trim() : "";
  if (!url) return;
  const baseUrl = resolveDaemonBaseUrl(url);
  if (isLoopbackDaemonBaseUrl(baseUrl)) return;
  const explicitToken = typeof opts.token === "string" ? opts.token.trim() : "";
  if (explicitToken.length > 0) return;
  throw new Error(
    `Remote daemon URL override requires --token. Refusing unauthenticated call to ${baseUrl}.`,
  );
}

export function registerCliPreActionHooks(program: Command): void {
  program.hook("preAction", async (_thisCommand, actionCommand) => {
    setProcessTitle(actionCommand);
    ensureStateDir();
    const opts = actionCommand.opts?.() as Record<string, unknown> | undefined;
    if (opts) {
      validateRemoteUrlTokenRequirement(opts);
    }
  });
}

