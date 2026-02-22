import { Command } from "commander";
import readline from "node:readline";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { daemonRequest, resolveDaemonBaseUrl, resolveDaemonToken } from "./daemon-client.js";

type ChatOptions = {
  session?: string;
  agent?: string;
  message?: string;
  url?: string;
  token?: string;
  economy?: boolean;
  history?: boolean;
  jsonEvents?: boolean;
  showThinking?: boolean;
  ensureDaemon?: boolean;
};

type ChatMessage = {
  role?: string;
  content?: unknown;
};

type ChatSession = {
  id: string;
  title?: string;
  agentId?: string;
  updatedAt?: number;
  preview?: string;
};

type AgentRecord = {
  id: string;
  name?: string;
  model?: string;
};

type ChatSseEvent = {
  type?: string;
  runId?: string;
  content?: string;
  name?: string;
  args?: unknown;
  result?: unknown;
  mode?: string;
  model?: string;
  provider?: string;
  thinking?: string;
  reasoningVisibility?: string;
  economyMode?: boolean;
  [key: string]: unknown;
};

const DEFAULT_PORT = 7433;
const PID_FILE = path.join(os.homedir(), ".undoable", "daemon.pid.json");
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

type DaemonState = {
  pid: number;
  port: number;
  startedAt: string;
};

function readDaemonState(): DaemonState | null {
  try {
    const raw = fs.readFileSync(PID_FILE, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DaemonState>;
    if (typeof parsed.pid !== "number" || typeof parsed.port !== "number") return null;
    return {
      pid: parsed.pid,
      port: parsed.port,
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeDaemonState(state: DaemonState) {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
  fs.writeFileSync(PID_FILE, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parsePortFromUrl(baseUrl: string): number {
  try {
    const url = new URL(baseUrl);
    if (url.port) {
      const parsed = Number.parseInt(url.port, 10);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) return parsed;
    }
    if (url.protocol === "https:") return 443;
    return 80;
  } catch {
    return DEFAULT_PORT;
  }
}

function isLocalDaemonUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

type LaunchSpec = {
  command: string;
  args: string[];
  requiresTsx: boolean;
};

function hasTsxLoader(rootDir: string): boolean {
  return fs.existsSync(path.join(rootDir, "node_modules", "tsx", "dist", "loader.mjs"));
}

function resolveDaemonLaunch(rootDir: string): LaunchSpec {
  const daemonDist = path.join(rootDir, "dist", "daemon", "index.mjs");
  if (fs.existsSync(daemonDist)) {
    return { command: "node", args: [daemonDist], requiresTsx: false };
  }
  const daemonEntry = path.join(rootDir, "packages", "daemon", "src", "index.ts");
  return { command: "node", args: ["--import", "tsx", daemonEntry], requiresTsx: true };
}

async function checkDaemonHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1200) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForDaemonHealth(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await checkDaemonHealth(baseUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return checkDaemonHealth(baseUrl);
}

async function ensureLocalDaemon(baseUrl: string): Promise<void> {
  if (!isLocalDaemonUrl(baseUrl)) return;
  if (await checkDaemonHealth(baseUrl)) return;

  const port = parsePortFromUrl(baseUrl);
  const existing = readDaemonState();
  if (existing && isProcessRunning(existing.pid)) {
    const ready = await waitForDaemonHealth(baseUrl, 5000);
    if (ready) return;
  }

  const rootDir = path.resolve(MODULE_DIR, "../../../..");
  const launch = resolveDaemonLaunch(rootDir);
  if (launch.requiresTsx && !hasTsxLoader(rootDir)) {
    throw new Error("Could not auto-start daemon: tsx loader is missing. Run `pnpm install` first.");
  }

  const child = spawn(launch.command, launch.args, {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      NRN_PORT: String(port),
    },
  });
  child.unref();

  const pid = child.pid ?? -1;
  if (pid <= 0) {
    throw new Error("Failed to start local daemon");
  }

  writeDaemonState({ pid, port, startedAt: new Date().toISOString() });
  const healthy = await waitForDaemonHealth(baseUrl, 6000);
  if (!healthy) {
    throw new Error(`Daemon process started (pid ${pid}) but health check did not pass in time`);
  }
  console.log(`[quickstart] daemon started on ${baseUrl} (pid ${pid})`);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && "text" in (part as Record<string, unknown>)) {
          const text = (part as Record<string, unknown>).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") {
    return JSON.stringify(content);
  }
  return "";
}

function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function summarizeValue(value: unknown, maxChars = 420): string {
  try {
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    if (!raw) return "";
    if (raw.length <= maxChars) return raw;
    return `${raw.slice(0, maxChars - 3)}...`;
  } catch {
    return "";
  }
}

function printToolLine(kind: "tool_call" | "tool_result", name: string, payload?: unknown) {
  const normalized = name || "tool";
  const summary = summarizeValue(payload);
  if (!summary) {
    console.log(`[${kind}] ${normalized}`);
    return;
  }
  console.log(`[${kind}] ${normalized}: ${summary}`);
}

function printHelp() {
  console.log("Commands:");
  console.log("  /help                 Show this help");
  console.log("  /status               Show daemon chat runtime status");
  console.log("  /model <provider/model> Switch active model/provider (ex: /model google/gemini-2.5-pro)");
  console.log("  /sessions             List chat sessions");
  console.log("  /session <id>         Switch to session id");
  console.log("  /new                  Create and switch to a new session");
  console.log("  /reset                Reset current session history");
  console.log("  /history              Reload current session history");
  console.log("  /agents               List agents");
  console.log("  /agent <id>           Set active agent for next messages");
  console.log("  /thinking on|off      Toggle rendering assistant thinking blocks");
  console.log("  /economy on|off|status Toggle economy mode");
  console.log("  /abort                Abort active run");
  console.log("  /clear                Clear terminal");
  console.log("  /exit                 Exit chat");
}

function renderHistory(messages: ChatMessage[], showThinking: boolean) {
  if (!messages.length) {
    console.log("(no history)");
    return;
  }

  for (const message of messages) {
    const role = message.role ?? "unknown";
    if (role === "user") {
      const text = extractText(message.content);
      if (text) console.log(`you> ${text}`);
      continue;
    }

    if (role === "assistant") {
      let text = extractText(message.content);
      if (!showThinking) text = stripThinking(text);
      if (text) console.log(`ai> ${text}`);
      continue;
    }

    if (role === "tool") {
      const text = extractText(message.content);
      if (text) console.log(`[tool] ${text}`);
      continue;
    }
  }
}

async function consumeSse(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ChatSseEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const idx = buffer.indexOf("\n\n");
      if (idx === -1) break;

      const rawBlock = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const lines = rawBlock.split(/\r?\n/);
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith(":")) continue;
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length === 0) continue;
      const data = dataLines.join("\n");
      if (data === "[DONE]") return;

      try {
        onEvent(JSON.parse(data) as ChatSseEvent);
      } catch {
        onEvent({ type: "raw", content: data });
      }
    }
  }
}

async function sendChatMessage(params: {
  baseUrl: string;
  token?: string;
  sessionId: string;
  agentId?: string;
  message: string;
  showThinking: boolean;
  jsonEvents: boolean;
  onRunId: (runId: string | null) => void;
  abortController: AbortController;
}) {
  const { baseUrl, token, sessionId, agentId, message, showThinking, jsonEvents, onRunId, abortController } = params;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message,
      sessionId,
      agentId,
    }),
    signal: abortController.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chat request failed (${res.status}): ${text || "unknown error"}`);
  }

  let printedAssistant = false;
  let newlineAfterAssistant = false;

  await consumeSse(res.body, (event) => {
    if (jsonEvents) {
      console.log(JSON.stringify(event));
      return;
    }

    switch (event.type) {
      case "run_start": {
        const runId = typeof event.runId === "string" ? event.runId : null;
        onRunId(runId);
        break;
      }
      case "session_info": {
        const mode = typeof event.mode === "string" ? event.mode : "unknown";
        const provider = typeof event.provider === "string" ? event.provider : "";
        const model = typeof event.model === "string" ? event.model : "";
        const economyMode = event.economyMode === true;
        const modelLabel = provider && model ? `${provider}/${model}` : model || provider || "unknown";
        console.log(
          `[session] mode=${mode} economy=${economyMode ? "on" : "off"} model=${modelLabel}`,
        );
        break;
      }
      case "token": {
        const content = typeof event.content === "string" ? event.content : "";
        if (!content) break;
        if (!printedAssistant) {
          process.stdout.write("ai> ");
          printedAssistant = true;
        }
        process.stdout.write(content);
        newlineAfterAssistant = true;
        break;
      }
      case "thinking": {
        if (!showThinking) break;
        const content = typeof event.content === "string" ? event.content : "";
        if (!content) break;
        if (newlineAfterAssistant) {
          process.stdout.write("\n");
          newlineAfterAssistant = false;
        }
        console.log(`[thinking] ${content}`);
        break;
      }
      case "tool_call": {
        const name = typeof event.name === "string" ? event.name : "tool";
        if (newlineAfterAssistant) {
          process.stdout.write("\n");
          newlineAfterAssistant = false;
        }
        printToolLine("tool_call", name, event.args);
        break;
      }
      case "tool_result": {
        const name = typeof event.name === "string" ? event.name : "tool";
        if (newlineAfterAssistant) {
          process.stdout.write("\n");
          newlineAfterAssistant = false;
        }
        printToolLine("tool_result", name, event.result);
        break;
      }
      case "warning": {
        const content = typeof event.content === "string" ? event.content : "warning";
        if (newlineAfterAssistant) {
          process.stdout.write("\n");
          newlineAfterAssistant = false;
        }
        console.log(`[warning] ${content}`);
        break;
      }
      case "error": {
        const content = typeof event.content === "string" ? event.content : "unknown error";
        if (newlineAfterAssistant) {
          process.stdout.write("\n");
          newlineAfterAssistant = false;
        }
        console.log(`[error] ${content}`);
        break;
      }
      case "done": {
        if (!printedAssistant) {
          const content = typeof event.content === "string" ? event.content : "";
          if (content) {
            console.log(`ai> ${showThinking ? content : stripThinking(content)}`);
          }
        } else if (newlineAfterAssistant) {
          process.stdout.write("\n");
          newlineAfterAssistant = false;
        }
        onRunId(null);
        break;
      }
      case "aborted": {
        if (newlineAfterAssistant) {
          process.stdout.write("\n");
          newlineAfterAssistant = false;
        }
        console.log("[aborted]");
        onRunId(null);
        break;
      }
      default:
        break;
    }
  });

  if (newlineAfterAssistant) {
    process.stdout.write("\n");
  }
  onRunId(null);
}

export function chatCommand(): Command {
  return new Command("chat")
    .description("Open interactive terminal chat for UNDOABLE — Swarm AI that actually executes")
    .option("--session <id>", "Session id", "default")
    .option("--agent <id>", "Agent id")
    .option("--message <text>", "Send an initial message")
    .option("--url <url>", "Daemon base URL (default: http://127.0.0.1:7433)")
    .option("--token <token>", "Gateway/daemon bearer token")
    .option("--economy", "Enable economy mode at chat start", false)
    .option("--no-history", "Do not load chat history on start")
    .option("--json-events", "Print raw SSE events", false)
    .option("--show-thinking", "Show model thinking blocks", false)
    .option("--no-ensure-daemon", "Do not auto-start local daemon when unavailable")
    .action(async (opts: ChatOptions) => {
      const baseUrl = resolveDaemonBaseUrl(opts.url);
      const token = resolveDaemonToken(opts.token);
      let sessionId = String(opts.session ?? "default").trim() || "default";
      let agentId = opts.agent?.trim() || undefined;
      let showThinking = Boolean(opts.showThinking);
      let activeRunId: string | null = null;
      let currentAbortController: AbortController | null = null;
      let lastCtrlC = 0;

      const abortActiveRun = async () => {
        if (!activeRunId) {
          console.log("[abort] no active run");
          return;
        }
        try {
          await daemonRequest<{ ok: boolean; aborted: boolean }>("/chat/abort", {
            url: baseUrl,
            token,
            method: "POST",
            body: { runId: activeRunId, sessionId },
          });
          console.log(`[abort] requested for ${activeRunId}`);
        } catch (err) {
          console.log(`[abort] failed: ${String(err)}`);
        }
        currentAbortController?.abort();
      };

      process.on("SIGINT", () => {
        if (activeRunId) {
          void abortActiveRun();
          return;
        }
        const now = Date.now();
        if (now - lastCtrlC < 1000) {
          process.exit(0);
        }
        lastCtrlC = now;
        console.log("\npress Ctrl+C again to exit");
      });

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });

      const ask = (prompt: string) =>
        new Promise<string>((resolve) => {
          rl.question(prompt, resolve);
        });

      const loadHistory = async () => {
        const path = `/chat/history?${new URLSearchParams({ sessionId }).toString()}`;
        const history = await daemonRequest<ChatMessage[]>(path, { url: baseUrl, token });
        renderHistory(history, showThinking);
      };

      const listSessions = async () => {
        const sessions = await daemonRequest<ChatSession[]>("/chat/sessions", {
          url: baseUrl,
          token,
        });
        if (sessions.length === 0) {
          console.log("(no sessions)");
          return;
        }
        for (const session of sessions) {
          const updated = session.updatedAt ? new Date(session.updatedAt).toISOString() : "";
          console.log(`${session.id}\t${session.agentId ?? "-"}\t${updated}\t${session.title ?? ""}`);
        }
      };

      const listAgents = async () => {
        const result = await daemonRequest<{ agents: AgentRecord[]; defaultId?: string | null }>("/chat/agents", {
          url: baseUrl,
          token,
        });
        if (!result.agents.length) {
          console.log("(no agents)");
          return;
        }
        for (const agent of result.agents) {
          const marker = agent.id === result.defaultId ? "*" : " ";
          console.log(`${marker} ${agent.id}\t${agent.name ?? ""}\t${agent.model ?? ""}`);
        }
      };

      const printStatus = async () => {
        const status = await daemonRequest<Record<string, unknown>>("/chat/run-config", {
          url: baseUrl,
          token,
        });
        console.log(JSON.stringify(status, null, 2));
      };

      const setEconomyMode = async (enabled: boolean) => {
        const result = await daemonRequest<{
          economyMode?: boolean;
          maxIterations?: number;
          configuredMaxIterations?: number;
        }>("/chat/run-config", {
          url: baseUrl,
          token,
          method: "POST",
          body: { economyMode: enabled },
        });
        const active = result.economyMode === true;
        const effectiveMax =
          typeof result.maxIterations === "number" ? result.maxIterations : null;
        const configuredMax =
          typeof result.configuredMaxIterations === "number"
            ? result.configuredMaxIterations
            : null;
        console.log(
          `[economy] ${active ? "on" : "off"}${effectiveMax ? ` (max ${effectiveMax}${configuredMax && configuredMax !== effectiveMax ? ` of ${configuredMax}` : ""})` : ""}`,
        );
      };

      const sendMessage = async (message: string) => {
        currentAbortController = new AbortController();
        try {
          await sendChatMessage({
            baseUrl,
            token,
            sessionId,
            agentId,
            message,
            showThinking,
            jsonEvents: Boolean(opts.jsonEvents),
            onRunId: (runId) => {
              activeRunId = runId;
            },
            abortController: currentAbortController,
          });
        } catch (err) {
          if (!currentAbortController.signal.aborted) {
            console.error(String(err));
          }
        } finally {
          activeRunId = null;
          currentAbortController = null;
        }
      };

      const handleCommand = async (line: string): Promise<boolean> => {
        const [command, ...rest] = line.slice(1).trim().split(/\s+/).filter(Boolean);
        const arg = rest.join(" ").trim();

        switch ((command ?? "").toLowerCase()) {
          case "help":
            printHelp();
            return false;
          case "exit":
          case "quit":
            return true;
          case "clear":
            process.stdout.write("\x1Bc");
            return false;
          case "status":
            await printStatus();
            return false;
          case "model":
            if (!arg) {
              console.log("usage: /model <provider/model>");
              return false;
            }
            await sendMessage(`/model ${arg}`);
            return false;
          case "sessions":
            await listSessions();
            return false;
          case "session":
            if (!arg) {
              console.log("usage: /session <id>");
              return false;
            }
            sessionId = arg;
            console.log(`[session] switched to ${sessionId}`);
            await loadHistory();
            return false;
          case "new": {
            const created = await daemonRequest<{ id: string }>("/chat/sessions", {
              url: baseUrl,
              token,
              method: "POST",
              body: {
                agentId,
              },
            });
            sessionId = created.id;
            console.log(`[session] created ${sessionId}`);
            return false;
          }
          case "reset":
            await daemonRequest(`/chat/sessions/${encodeURIComponent(sessionId)}/reset`, {
              url: baseUrl,
              token,
              method: "POST",
            });
            console.log(`[session] reset ${sessionId}`);
            return false;
          case "history":
            await loadHistory();
            return false;
          case "agents":
            await listAgents();
            return false;
          case "agent":
            if (!arg) {
              console.log("usage: /agent <id>");
              return false;
            }
            agentId = arg;
            console.log(`[agent] ${agentId}`);
            return false;
          case "thinking":
            if (!arg || (arg !== "on" && arg !== "off")) {
              console.log("usage: /thinking on|off");
              return false;
            }
            showThinking = arg === "on";
            console.log(`[thinking] ${showThinking ? "on" : "off"}`);
            return false;
          case "economy":
            if (!arg || arg === "status") {
              await printStatus();
              return false;
            }
            if (arg !== "on" && arg !== "off") {
              console.log("usage: /economy on|off|status");
              return false;
            }
            await setEconomyMode(arg === "on");
            return false;
          case "abort":
            await abortActiveRun();
            return false;
          default:
            console.log(`unknown command: /${command}`);
            console.log("type /help for command list");
            return false;
        }
      };

      try {
        if (opts.ensureDaemon !== false) {
          await ensureLocalDaemon(baseUrl);
        }

        console.log(`Connected to ${baseUrl}`);
        console.log(`Session: ${sessionId}`);
        console.log(`Agent: ${agentId ?? "default"}`);
        console.log("Type /help for commands.");

        if (opts.economy) {
          await setEconomyMode(true);
        }

        if (opts.history !== false) {
          await loadHistory();
        }

        if (opts.message?.trim()) {
          console.log(`you> ${opts.message}`);
          await sendMessage(opts.message.trim());
        }

        while (true) {
          const line = (await ask("you> ")).trim();
          if (!line) continue;
          if (line.startsWith("/")) {
            const shouldExit = await handleCommand(line);
            if (shouldExit) break;
            continue;
          }
          await sendMessage(line);
        }
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      } finally {
        rl.close();
      }
    });
}
