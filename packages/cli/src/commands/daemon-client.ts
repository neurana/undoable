const DEFAULT_DAEMON_URL = "http://127.0.0.1:7433";

export function resolveDaemonBaseUrl(raw?: string): string {
  const fromInput = raw?.trim();
  const fromEnv = process.env.UNDOABLE_DAEMON_URL?.trim();
  const value = fromInput || fromEnv || DEFAULT_DAEMON_URL;
  return value.replace(/\/+$/, "");
}

export function resolveDaemonToken(raw?: string): string | undefined {
  const token = raw?.trim() || process.env.UNDOABLE_TOKEN?.trim();
  return token || undefined;
}

function normalizeHost(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice("::ffff:".length);
  }
  return trimmed;
}

export function isLoopbackDaemonBaseUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = normalizeHost(parsed.hostname);
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

type DaemonRequestOptions = {
  url?: string;
  token?: string;
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export async function daemonRequest<T>(apiPath: string, opts: DaemonRequestOptions = {}): Promise<T> {
  const baseUrl = resolveDaemonBaseUrl(opts.url);
  const explicitToken = opts.token?.trim();
  const explicitUrl = opts.url?.trim();
  if (explicitUrl && !isLoopbackDaemonBaseUrl(baseUrl) && !explicitToken) {
    throw new Error(
      `Remote daemon URL override requires an explicit token (--token). Refusing unauthenticated call to ${baseUrl}.`,
    );
  }
  const token = resolveDaemonToken(opts.token);
  const target = `${baseUrl}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`;

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers,
    signal: opts.signal,
  };

  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(target, init);
  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "";

  let parsed: unknown = text;
  if (text && contentType.includes("application/json")) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const detail =
      parsed && typeof parsed === "object" && "error" in (parsed as Record<string, unknown>)
        ? String((parsed as Record<string, unknown>).error)
        : text || `HTTP ${res.status}`;
    throw new Error(`Daemon request failed (${res.status}): ${detail}`);
  }

  return parsed as T;
}
