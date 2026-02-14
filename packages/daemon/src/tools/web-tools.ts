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

const BROWSER_ACTIONS = [
  "navigate",
  "click",
  "type",
  "screenshot",
  "get_text",
  "evaluate",
  "tabs",
  "open_tab",
  "close_tab",
  "focus_tab",
  "snapshot",
  "pdf",
  "dialog",
  "upload",
  "wait",
  "scroll",
] as const;

export function createBrowserTool(browserSvc: BrowserService): AgentTool {
  return {
    name: "browser",
    definition: {
      type: "function",
      function: {
        name: "browser",
        description: [
          "Rich browser control with tab management, accessibility snapshots, PDF export, dialog handling, and file upload.",
          "Actions:",
          "  navigate — go to URL",
          "  click — click CSS selector",
          "  type — fill text into CSS selector",
          "  screenshot — capture page (fullPage: bool)",
          "  get_text — extract visible text",
          "  evaluate — run JavaScript",
          "  tabs — list open tabs",
          "  open_tab — open new tab (optional URL)",
          "  close_tab — close tab by index",
          "  focus_tab — switch to tab by index",
          "  snapshot — get accessibility tree (aria roles, names, values)",
          "  pdf — export page as PDF",
          "  dialog — arm next dialog (accept/dismiss)",
          "  upload — upload files to file input",
          "  wait — wait for CSS selector to appear",
          "  scroll — scroll to (x, y) position",
        ].join("\n"),
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: [...BROWSER_ACTIONS],
              description: "Browser action to perform",
            },
            url: { type: "string", description: "URL for navigate / open_tab" },
            selector: { type: "string", description: "CSS selector for click / type / upload / wait" },
            text: { type: "string", description: "Text for type action" },
            script: { type: "string", description: "JavaScript for evaluate" },
            index: { type: "number", description: "Tab index for close_tab / focus_tab" },
            fullPage: { type: "boolean", description: "Full page screenshot (default: false)" },
            accept: { type: "boolean", description: "Accept or dismiss dialog" },
            promptText: { type: "string", description: "Text to enter in prompt dialog" },
            paths: {
              type: "array",
              items: { type: "string" },
              description: "File paths for upload",
            },
            x: { type: "number", description: "X coordinate for scroll" },
            y: { type: "number", description: "Y coordinate for scroll" },
            timeout: { type: "number", description: "Timeout in ms for wait (default: 10000)" },
            outputPath: { type: "string", description: "Output file path for PDF" },
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
            const b64 = await browserSvc.screenshot({ fullPage: args.fullPage as boolean });
            return { result: "Screenshot captured", base64Length: b64.length };
          }

          case "get_text":
            return { text: await browserSvc.getText() };

          case "evaluate":
            return { result: await browserSvc.evaluate(args.script as string) };

          case "tabs":
            return { tabs: await browserSvc.tabs() };

          case "open_tab":
            return { tab: await browserSvc.openTab(args.url as string | undefined) };

          case "close_tab":
            return { result: await browserSvc.closeTab(args.index as number) };

          case "focus_tab":
            return { result: await browserSvc.focusTab(args.index as number) };

          case "snapshot": {
            const tree = await browserSvc.snapshot();
            return tree ? { snapshot: tree } : { error: "No accessibility tree available" };
          }

          case "pdf": {
            const filePath = await browserSvc.pdf(args.outputPath as string | undefined);
            return { result: `PDF saved to ${filePath}`, path: filePath };
          }

          case "dialog": {
            const accept = args.accept as boolean ?? true;
            const promptText = args.promptText as string | undefined;
            return { result: await browserSvc.armDialog(accept, promptText) };
          }

          case "upload": {
            const selector = args.selector as string;
            const paths = args.paths as string[];
            return { result: await browserSvc.uploadFile(selector, paths) };
          }

          case "wait": {
            const selector = args.selector as string;
            const timeout = args.timeout as number | undefined;
            return { result: await browserSvc.waitForSelector(selector, timeout) };
          }

          case "scroll": {
            const x = (args.x as number) ?? 0;
            const y = (args.y as number) ?? 0;
            return { result: await browserSvc.scroll(x, y) };
          }

          default:
            return { error: `Unknown browser action: ${action}` };
        }
      } catch (err) {
        return { error: `Browser ${action} failed: ${(err as Error).message}` };
      }
    },
  };
}
