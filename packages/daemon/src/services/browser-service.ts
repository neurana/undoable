import { chromium, type Browser, type BrowserContext, type Page, type Dialog } from "playwright";
import path from "node:path";
import os from "node:os";

export type TabInfo = {
  index: number;
  url: string;
  title: string;
  active: boolean;
};

export type SnapshotNode = {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  children?: SnapshotNode[];
};

export type BrowserService = {
  /* Navigation & content */
  navigate(url: string): Promise<string>;
  click(selector: string): Promise<string>;
  type(selector: string, text: string): Promise<string>;
  screenshot(opts?: { fullPage?: boolean }): Promise<string>;
  evaluate(script: string): Promise<string>;
  getText(): Promise<string>;

  /* Tab management */
  tabs(): Promise<TabInfo[]>;
  openTab(url?: string): Promise<TabInfo>;
  closeTab(index: number): Promise<string>;
  focusTab(index: number): Promise<string>;

  /* Snapshots */
  snapshot(): Promise<SnapshotNode | null>;

  /* PDF */
  pdf(outputPath?: string): Promise<string>;

  /* Dialog handling */
  armDialog(accept: boolean, promptText?: string): Promise<string>;

  /* File upload */
  uploadFile(selector: string, paths: string[]): Promise<string>;

  /* Wait & scroll */
  waitForSelector(selector: string, timeout?: number): Promise<string>;
  scroll(x: number, y: number): Promise<string>;

  /* Lifecycle */
  close(): Promise<void>;
};

export async function createBrowserService(): Promise<BrowserService> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let activePage: Page | null = null;
  let pendingDialogHandler: ((dialog: Dialog) => void) | null = null;

  async function ensureContext(): Promise<BrowserContext> {
    if (!browser) {
      browser = await chromium.launch({ headless: true });
    }
    if (!context) {
      context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 720 },
      });
    }
    return context;
  }

  async function ensurePage(): Promise<Page> {
    const ctx = await ensureContext();
    if (!activePage || activePage.isClosed()) {
      const pages = ctx.pages();
      activePage = pages.length > 0 ? pages[pages.length - 1]! : await ctx.newPage();
    }
    return activePage!;
  }

  function getPages(): Page[] {
    if (!context) return [];
    return context.pages().filter((p) => !p.isClosed());
  }

  function activeIndex(): number {
    const pages = getPages();
    return activePage ? pages.indexOf(activePage) : 0;
  }

  return {
    /* ── Navigation & content ── */

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

    async screenshot(opts?: { fullPage?: boolean }) {
      const p = await ensurePage();
      const buf = await p.screenshot({ type: "png", fullPage: opts?.fullPage ?? false });
      return buf.toString("base64");
    },

    async evaluate(script: string) {
      const p = await ensurePage();
      const result = await p.evaluate(script);
      return JSON.stringify(result);
    },

    async getText() {
      const p = await ensurePage();
      const text = (await p.evaluate(`
        (() => {
          const body = document.body;
          if (!body) return "";
          const clone = body.cloneNode(true);
          clone.querySelectorAll("script, style, noscript, svg, img").forEach(el => el.remove());
          return (clone.textContent || "").replace(/\\s+/g, " ").trim();
        })()
      `)) as string;
      return (text ?? "").slice(0, 8000);
    },

    /* ── Tab management ── */

    async tabs() {
      await ensureContext();
      const pages = getPages();
      const currentIdx = activeIndex();
      const result: TabInfo[] = [];
      for (let i = 0; i < pages.length; i++) {
        const pg = pages[i]!;
        result.push({
          index: i,
          url: pg.url(),
          title: await pg.title(),
          active: i === currentIdx,
        });
      }
      return result;
    },

    async openTab(url?: string) {
      const ctx = await ensureContext();
      const newPage = await ctx.newPage();
      if (url) {
        await newPage.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      }
      activePage = newPage;
      const pages = getPages();
      return {
        index: pages.indexOf(newPage),
        url: newPage.url(),
        title: await newPage.title(),
        active: true,
      };
    },

    async closeTab(index: number) {
      const pages = getPages();
      if (index < 0 || index >= pages.length) {
        throw new Error(`Tab index ${index} out of range (0-${pages.length - 1})`);
      }
      const target = pages[index]!;
      const wasActive = target === activePage;
      await target.close();
      if (wasActive) {
        const remaining = getPages();
        activePage = remaining.length > 0 ? remaining[Math.min(index, remaining.length - 1)]! : null;
      }
      return `Closed tab ${index}. ${getPages().length} tab(s) remaining.`;
    },

    async focusTab(index: number) {
      const pages = getPages();
      if (index < 0 || index >= pages.length) {
        throw new Error(`Tab index ${index} out of range (0-${pages.length - 1})`);
      }
      activePage = pages[index]!;
      await activePage.bringToFront();
      return `Focused tab ${index}: ${activePage.url()}`;
    },

    /* ── Snapshots ── */

    async snapshot() {
      const p = await ensurePage();
      const tree = await p.evaluate(`
        (() => {
          function walk(el) {
            const role = el.getAttribute("role") || el.tagName.toLowerCase();
            const name = el.getAttribute("aria-label") || el.getAttribute("alt") || el.textContent?.trim().slice(0, 100) || "";
            const value = el.getAttribute("value") || el.getAttribute("aria-valuenow") || "";
            const children = [];
            for (const child of el.children) {
              const c = walk(child);
              if (c) children.push(c);
            }
            if (!name && children.length === 0) return null;
            const node = { role, name };
            if (value) node.value = value;
            if (children.length > 0) node.children = children;
            return node;
          }
          return walk(document.body);
        })()
      `);
      return tree as SnapshotNode | null;
    },

    /* ── PDF ── */

    async pdf(outputPath?: string) {
      const p = await ensurePage();
      const filePath = outputPath ?? path.join(os.tmpdir(), `page-${Date.now()}.pdf`);
      await p.pdf({ path: filePath, format: "A4" });
      return filePath;
    },

    /* ── Dialog handling ── */

    async armDialog(accept: boolean, promptText?: string) {
      const p = await ensurePage();

      if (pendingDialogHandler) {
        p.removeListener("dialog", pendingDialogHandler);
      }

      return new Promise<string>((resolve) => {
        const handler = async (dialog: Dialog) => {
          pendingDialogHandler = null;
          if (accept) {
            await dialog.accept(promptText);
          } else {
            await dialog.dismiss();
          }
          resolve(
            `Dialog "${dialog.type()}" handled: ${accept ? "accepted" : "dismissed"}. Message: "${dialog.message()}"`,
          );
        };
        pendingDialogHandler = handler;
        p.once("dialog", handler);

        setTimeout(() => {
          if (pendingDialogHandler === handler) {
            p.removeListener("dialog", handler);
            pendingDialogHandler = null;
            resolve("Dialog armed — no dialog appeared within 30s timeout.");
          }
        }, 30_000);
      });
    },

    /* ── File upload ── */

    async uploadFile(selector: string, paths: string[]) {
      const p = await ensurePage();
      await p.setInputFiles(selector, paths, { timeout: 5000 });
      return `Uploaded ${paths.length} file(s) to ${selector}`;
    },

    /* ── Wait & scroll ── */

    async waitForSelector(selector: string, timeout?: number) {
      const p = await ensurePage();
      await p.waitForSelector(selector, { timeout: timeout ?? 10000 });
      return `Selector "${selector}" found.`;
    },

    async scroll(x: number, y: number) {
      const p = await ensurePage();
      await p.evaluate(`window.scrollTo(${x}, ${y})`);
      return `Scrolled to (${x}, ${y})`;
    },

    /* ── Lifecycle ── */

    async close() {
      if (browser) {
        await browser.close().catch(() => {});
        browser = null;
        context = null;
        activePage = null;
        pendingDialogHandler = null;
      }
    },
  };
}
