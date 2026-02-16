import { Command } from "commander";
import { daemonRequest, resolveDaemonBaseUrl, resolveDaemonToken } from "./daemon-client.js";

type RunEvent = {
  eventId?: number;
  runId?: string;
  ts?: string;
  type?: string;
  payload?: Record<string, unknown>;
};

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

function formatEvent(event: RunEvent): string {
  const ts = typeof event.ts === "string" ? event.ts : "";
  const type = typeof event.type === "string" ? event.type : "event";
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};

  if (type === "STATUS_CHANGED" && typeof payload.status === "string") {
    return `${ts} [${type}] status=${payload.status}`.trim();
  }
  if (type === "TOOL_CALL" && typeof payload.name === "string") {
    return `${ts} [${type}] ${payload.name}`.trim();
  }
  if (type === "TOOL_RESULT") {
    const name = typeof payload.name === "string" ? payload.name : "tool";
    return `${ts} [${type}] ${name}`.trim();
  }

  return `${ts} [${type}] ${JSON.stringify(payload)}`.trim();
}

function isTerminalEvent(event: RunEvent): boolean {
  const type = typeof event.type === "string" ? event.type : "";
  if (type === "RUN_COMPLETED" || type === "RUN_FAILED" || type === "RUN_CANCELLED") {
    return true;
  }
  if (type === "STATUS_CHANGED") {
    const status = typeof event.payload?.status === "string" ? event.payload.status : "";
    return TERMINAL_STATUSES.has(status);
  }
  return false;
}

async function consumeSseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: RunEvent) => void,
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

      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLines = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart());

      if (dataLines.length === 0) continue;
      const data = dataLines.join("\n");
      try {
        onEvent(JSON.parse(data) as RunEvent);
      } catch {
        onEvent({ type: "RAW", payload: { data } });
      }
    }
  }
}

export function streamCommand(): Command {
  return new Command("stream")
    .description("Follow a run in real time")
    .argument("<runId>", "Run ID to stream")
    .option("--url <url>", "Daemon base URL (default: http://127.0.0.1:7433)")
    .option("--token <token>", "Gateway/daemon bearer token")
    .option("--json", "Print raw JSON events", false)
    .option("--timeout-ms <ms>", "Abort stream after timeout in ms", "0")
    .action(async (runId, opts) => {
      try {
        const baseUrl = resolveDaemonBaseUrl(opts.url as string | undefined);
        const token = resolveDaemonToken(opts.token as string | undefined);

        await daemonRequest(`/runs/${encodeURIComponent(String(runId))}`, {
          url: baseUrl,
          token,
        });

        const controller = new AbortController();
        const timeoutMs = Math.max(0, Number.parseInt(String(opts.timeoutMs ?? "0"), 10) || 0);
        const timeout = timeoutMs > 0
          ? setTimeout(() => controller.abort(new Error("stream timeout")), timeoutMs)
          : null;

        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(`${baseUrl}/runs/${encodeURIComponent(String(runId))}/events`, {
          method: "GET",
          headers,
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(`Unable to stream events (${res.status}): ${text || "unknown error"}`);
        }

        console.log(`Streaming run ${runId} from ${baseUrl}...`);
        let ended = false;

        try {
          await consumeSseStream(res.body, (event) => {
            if (opts.json) {
              console.log(JSON.stringify(event));
            } else {
              console.log(formatEvent(event));
            }

            if (isTerminalEvent(event) && !ended) {
              ended = true;
              controller.abort();
            }
          });
        } catch (err) {
          const aborted = controller.signal.aborted;
          if (!aborted) throw err;
        } finally {
          if (timeout) clearTimeout(timeout);
        }

        if (ended) {
          console.log(`Run ${runId} reached terminal state.`);
        } else if (timeoutMs > 0) {
          console.log(`Stream timed out after ${timeoutMs}ms.`);
        }
      } catch (err) {
        console.error(String(err));
        process.exitCode = 1;
      }
    });
}
