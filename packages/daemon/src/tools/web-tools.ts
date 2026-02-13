import type { AgentTool } from "./types.js";
import type { BrowserService } from "../services/browser-service.js";
import { extractReadableContent } from "../services/web-utils.js";

export function createWebFetchTool(): AgentTool {
  return {
    name: "web_fetch",
    definition: {
      type: "function",
      function: {
        name: "web_fetch",
        description: "Raw HTTP request. Use for APIs, POST requests, custom headers. For reading normal web pages, prefer browse_page.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to fetch" },
            method: { type: "string", enum: ["GET", "POST"], description: "HTTP method (default: GET)" },
            headers: { type: "object", description: "Optional HTTP headers" },
            body: { type: "string", description: "Request body for POST" },
          },
          required: ["url"],
        },
      },
    },
    execute: async (args) => {
      const url = args.url as string;
      const method = (args.method as string) ?? "GET";
      const hdrs = (args.headers as Record<string, string>) ?? {};
      const body = args.body as string | undefined;
      const res = await fetch(url, {
        method,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 Chrome/122 Safari/537.36",
          ...hdrs,
        },
        body: method === "POST" ? body : undefined,
        signal: AbortSignal.timeout(15000),
      });
      const rawText = await res.text();
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        const readable = await extractReadableContent({ html: rawText, url });
        return {
          url,
          status: res.status,
          title: readable.title,
          content: readable.text.slice(0, 20000),
          truncated: readable.text.length > 20000,
        };
      }
      if (contentType.includes("application/json")) {
        try {
          const json = JSON.parse(rawText);
          return { url, status: res.status, contentType, body: JSON.stringify(json, null, 2).slice(0, 20000) };
        } catch { }
      }
      return {
        url,
        status: res.status,
        contentType,
        body: rawText.slice(0, 12000),
        truncated: rawText.length > 12000,
      };
    },
  };
}

export function createBrowsePageTool(browserSvc: BrowserService): AgentTool {
  return {
    name: "browse_page",
    definition: {
      type: "function",
      function: {
        name: "browse_page",
        description: "Navigate to a URL with a real browser and extract structured content. Returns title, headings, main text, and links.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to visit" },
          },
          required: ["url"],
        },
      },
    },
    execute: async (args) => {
      const url = args.url as string;
      try {
        await browserSvc.navigate(url);
        const rawHtml = (await browserSvc.evaluate(`document.documentElement.outerHTML`)) as string;
        const readable = await extractReadableContent({ html: rawHtml, url });
        const metaJson = (await browserSvc.evaluate(`
          JSON.stringify({
            metaDescription: (document.querySelector('meta[name="description"]') || {}).content || "",
            headings: Array.from(document.querySelectorAll("h1,h2,h3")).slice(0, 20).map(h => ({ level: h.tagName, text: h.textContent.trim().substring(0, 200) })),
            links: Array.from(document.querySelectorAll("a[href]")).slice(0, 30).map(a => ({ text: a.textContent.trim().substring(0, 80), href: a.href })).filter(l => l.text && l.href.startsWith("http")),
          })
        `)) as string;
        const meta = JSON.parse(metaJson);
        return { url, title: readable.title ?? "", ...meta, content: readable.text };
      } catch (err) {
        return { url, error: `Failed to browse: ${(err as Error).message}` };
      }
    },
  };
}

export function createBrowserTool(browserSvc: BrowserService): AgentTool {
  return {
    name: "browser",
    definition: {
      type: "function",
      function: {
        name: "browser",
        description: "Low-level browser control. Use only when browse_page isn't enough (e.g., clicking, typing, screenshots, JS evaluation).",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["navigate", "click", "type", "screenshot", "get_text", "evaluate"], description: "Browser action" },
            url: { type: "string", description: "URL for navigate" },
            selector: { type: "string", description: "CSS selector for click/type" },
            text: { type: "string", description: "Text for type action" },
            script: { type: "string", description: "JavaScript for evaluate" },
          },
          required: ["action"],
        },
      },
    },
    execute: async (args) => {
      const action = args.action as string;
      try {
        switch (action) {
          case "navigate":
            return { result: await browserSvc.navigate(args.url as string) };
          case "click":
            return { result: await browserSvc.click(args.selector as string) };
          case "type":
            return { result: await browserSvc.type(args.selector as string, args.text as string) };
          case "screenshot": {
            const b64 = await browserSvc.screenshot();
            return { result: "Screenshot taken", base64Length: b64.length };
          }
          case "get_text":
            return { text: await browserSvc.getText() };
          case "evaluate":
            return { result: await browserSvc.evaluate(args.script as string) };
          default:
            return { error: `Unknown browser action: ${action}` };
        }
      } catch (err) {
        return { error: `Browser ${action} failed: ${(err as Error).message}` };
      }
    },
  };
}
