import { chromium, type Browser, type Page } from "playwright";

export type BrowserService = {
  navigate(url: string): Promise<string>;
  click(selector: string): Promise<string>;
  type(selector: string, text: string): Promise<string>;
  screenshot(): Promise<string>;
  evaluate(script: string): Promise<string>;
  getText(): Promise<string>;
  close(): Promise<void>;
};

export async function createBrowserService(): Promise<BrowserService> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  async function ensurePage(): Promise<Page> {
    if (!browser) {
      browser = await chromium.launch({ headless: true });
    }
    if (!page || page.isClosed()) {
      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 720 },
      });
      page = await context.newPage();
    }
    return page;
  }

  return {
    async navigate(url: string) {
      const p = await ensurePage();
      await p.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      const title = await p.title();
      return `Navigated to ${url} — title: "${title}"`;
    },

    async click(selector: string) {
      const p = await ensurePage();
      await p.click(selector, { timeout: 5000 });
      return `Clicked ${selector}`;
    },

    async type(selector: string, text: string) {
      const p = await ensurePage();
      await p.fill(selector, text, { timeout: 5000 });
      return `Typed into ${selector}`;
    },

    async screenshot() {
      const p = await ensurePage();
      const buf = await p.screenshot({ type: "png", fullPage: false });
      return buf.toString("base64");
    },

    async evaluate(script: string) {
      const p = await ensurePage();
      const result = await p.evaluate(script);
      return JSON.stringify(result);
    },

    async getText() {
      const p = await ensurePage();
      const text = await p.evaluate(`
        (() => {
          const body = document.body;
          if (!body) return "";
          const clone = body.cloneNode(true);
          clone.querySelectorAll("script, style, noscript, svg, img").forEach(el => el.remove());
          return (clone.textContent || "").replace(/\\s+/g, " ").trim();
        })()
      `) as string;
      return (text ?? "").slice(0, 8000);
    },

    async close() {
      if (browser) {
        await browser.close().catch(() => {});
        browser = null;
        page = null;
      }
    },
  };
}
