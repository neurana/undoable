import type { ToolAdapter, ToolExecuteParams, ToolResult } from "../types.js";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const DEFAULT_TIMEOUT = 30_000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

export class HttpAdapter implements ToolAdapter {
  readonly id = "http";
  readonly description = "Policy-gated HTTP requests with full audit";
  readonly requiredCapabilityPrefix = "http.request";

  async execute(params: ToolExecuteParams): Promise<ToolResult> {
    const method = (params.params.method as HttpMethod) ?? "GET";
    const url = params.params.url as string;
    const headers = (params.params.headers as Record<string, string>) ?? {};
    const body = params.params.body as string | undefined;
    const timeout = (params.params.timeout as number) ?? DEFAULT_TIMEOUT;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { success: false, output: "", error: `Invalid URL: ${url}` };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const start = Date.now();
      const response = await fetch(url, {
        method,
        headers,
        body: body ?? undefined,
        signal: controller.signal,
      });

      const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
      if (contentLength > MAX_RESPONSE_SIZE) {
        return { success: false, output: "", error: `Response too large: ${contentLength} bytes` };
      }

      const responseBody = await response.text();
      const duration = Date.now() - start;

      return {
        success: response.ok,
        output: responseBody,
        metadata: {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          duration,
          size: responseBody.length,
          host: parsedUrl.hostname,
        },
        error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("abort")) {
        return { success: false, output: "", error: `Request timed out after ${timeout}ms` };
      }
      return { success: false, output: "", error: `HTTP request failed: ${message}` };
    } finally {
      clearTimeout(timer);
    }
  }

  validate(params: Record<string, unknown>): boolean {
    return typeof params.url === "string";
  }

  estimateCapabilities(params: Record<string, unknown>): string[] {
    const method = (params.method as string) ?? "GET";
    try {
      const url = new URL(params.url as string);
      return [`http.request:${method}:${url.hostname}${url.pathname}`];
    } catch {
      return [`http.request:${method}:*`];
    }
  }
}
