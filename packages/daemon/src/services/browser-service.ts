import { chromium, type Browser, type BrowserContext, type Page, type Dialog } from "playwright";
import fs from "node:fs";
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

  /* Headless mode */
  setHeadless(value: boolean): Promise<void>;
  isHeadless(): boolean;

  /* Lifecycle */
  close(): Promise<void>;
};

export type BrowserLaunchOptions = {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  persistSession?: boolean;
  launchArgs?: string[];
  proxy?: { server: string; username?: string; password?: string };
};

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const STORAGE_STATE_PATH = path.join(os.homedir(), ".undoable", "browser-state.json");
const DEFAULT_NAVIGATION_TIMEOUT_MS = 20_000;
const FALLBACK_SEARCH_URL = "https://duckduckgo.com/?q=";
const VM_SAFE_CHROMIUM_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-zygote",
  "--no-first-run",
  "--no-default-browser-check",
];

type NavigationTarget = {
  targetUrl: string;
  mode: "navigate" | "search";
  original: string;
};

function normalizeBooleanEnv(raw: string | undefined): boolean | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return null;
}

function shouldUseVmCompatibilityArgs(): boolean {
  const envValue = normalizeBooleanEnv(process.env.UNDOABLE_BROWSER_VM_COMPAT);
  if (envValue !== null) return envValue;
  return process.platform === "linux";
}

function dedupeArgs(args: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const arg of args) {
    const normalized = arg.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function buildChromiumArgs(baseArgs: string[]): string[] {
  const merged = [...baseArgs];
  if (shouldUseVmCompatibilityArgs()) {
    merged.push(...VM_SAFE_CHROMIUM_ARGS);
  }
  return dedupeArgs(merged);
}

function isHeadfulUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /missing x server/i.test(message) ||
    /failed to launch browser process/i.test(message) ||
    /\$display/i.test(message) ||
    /ozone platform x11/i.test(message);
}

function normalizeNavigationTarget(rawUrl: string): NavigationTarget {
  const input = rawUrl.trim();
  if (!input) {
    throw new Error("URL is required.");
  }

  if (/^javascript:/i.test(input)) {
    throw new Error("javascript: URLs are not allowed.");
  }

  if (/\s/.test(input)) {
    return {
      targetUrl: `${FALLBACK_SEARCH_URL}${encodeURIComponent(input)}`,
      mode: "search",
      original: input,
    };
  }

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { targetUrl: parsed.toString(), mode: "navigate", original: input };
    }
    if (parsed.protocol === "about:" || parsed.protocol === "file:" || parsed.protocol === "data:") {
      return { targetUrl: parsed.toString(), mode: "navigate", original: input };
    }
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unsupported URL protocol:")) {
      throw error;
    }
    return {
      targetUrl: `${FALLBACK_SEARCH_URL}${encodeURIComponent(input)}`,
      mode: "search",
      original: input,
    };
  }
}

async function gotoWithFallback(page: Page, targetUrl: string): Promise<void> {
  const attempts: Array<{
    waitUntil: "domcontentloaded" | "load" | "networkidle";
    timeout: number;
  }> = [
    { waitUntil: "domcontentloaded", timeout: DEFAULT_NAVIGATION_TIMEOUT_MS },
    { waitUntil: "load", timeout: DEFAULT_NAVIGATION_TIMEOUT_MS + 5_000 },
    { waitUntil: "networkidle", timeout: DEFAULT_NAVIGATION_TIMEOUT_MS + 10_000 },
  ];
  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      await page.goto(targetUrl, attempt);
      try {
        await page.waitForLoadState("networkidle", { timeout: 3_000 });
      } catch {
        // Some pages keep long-lived connections. This is best-effort only.
      }
      return;
    } catch (error) {
      lastError = error;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Navigation failed for ${targetUrl}: ${reason}`);
}

async function safePageTitle(page: Page): Promise<string> {
  try {
    const title = await page.title();
    return title.trim() || "(untitled)";
  } catch {
    return "(untitled)";
  }
}

export async function createBrowserService(opts?: BrowserLaunchOptions): Promise<BrowserService> {
  let headless = opts?.headless ?? true;
  const viewport = opts?.viewport ?? DEFAULT_VIEWPORT;
  const userAgent = opts?.userAgent ?? DEFAULT_USER_AGENT;
  const persistSession = opts?.persistSession ?? false;
  const launchArgs = opts?.launchArgs ?? [];
  const proxyOpts = opts?.proxy;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let activePage: Page | null = null;
  let pendingDialogHandler: ((dialog: Dialog) => void) | null = null;
  let launchNotice: string | null = null;
  let ensureContextInFlight: Promise<BrowserContext> | null = null;

  async function saveStorageState(): Promise<void> {
    if (!persistSession || !context) return;
    try {
      const dir = path.dirname(STORAGE_STATE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await context.storageState({ path: STORAGE_STATE_PATH });
    } catch { }
  }

  async function closeBrowser(): Promise<void> {
    if (browser) {
      await saveStorageState();
      await browser.close().catch(() => {});
      browser = null;
      context = null;
      activePage = null;
      pendingDialogHandler = null;
      ensureContextInFlight = null;
    }
  }

  async function ensureContext(): Promise<BrowserContext> {
    if (context) return context;
    if (ensureContextInFlight) return ensureContextInFlight;

    ensureContextInFlight = (async () => {
    if (!browser) {
      const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
      const chromiumArgs = buildChromiumArgs(launchArgs);
      const proxy =
        proxyOpts
          ? { server: proxyOpts.server, username: proxyOpts.username, password: proxyOpts.password }
          : undefined;

      try {
        browser = await chromium.launch({
          headless,
          executablePath,
          args: chromiumArgs.length > 0 ? chromiumArgs : undefined,
          proxy,
        });
      } catch (error) {
        if (!headless && isHeadfulUnavailableError(error)) {
          headless = true;
          launchNotice =
            "Headful browser is unavailable in this VM/environment; switched to headless automatically. Continue with browser actions in headless mode (navigate/click/type/scroll/wait/tabs/screenshot).";
          browser = await chromium.launch({
            headless: true,
            executablePath,
            args: chromiumArgs.length > 0 ? chromiumArgs : undefined,
            proxy,
          });
        } else {
          throw error;
        }
      }
    }
    if (!context) {
      const storageState = persistSession && fs.existsSync(STORAGE_STATE_PATH) ? STORAGE_STATE_PATH : undefined;
      context = await browser.newContext({ userAgent, viewport, storageState });
    }
      return context;
    })();

    try {
      return await ensureContextInFlight;
    } finally {
      ensureContextInFlight = null;
    }
  }

  function consumeLaunchNotice(): string | null {
    if (!launchNotice) return null;
    const notice = launchNotice;
    launchNotice = null;
    return notice;
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
      const target = normalizeNavigationTarget(url);
      await gotoWithFallback(p, target.targetUrl);
      const resolvedUrl = p.url();
      const title = await safePageTitle(p);
      const summary =
        target.mode === "search"
          ? `Searched for "${target.original}" and opened ${resolvedUrl} — title: "${title}"`
          : `Navigated to ${resolvedUrl} — title: "${title}"`;
      const notice = consumeLaunchNotice();
      return notice ? `${summary}. ${notice}` : summary;
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
          title: await safePageTitle(pg),
          active: i === currentIdx,
        });
      }
      return result;
    },

    async openTab(url?: string) {
      const ctx = await ensureContext();
      const newPage = await ctx.newPage();
      if (url) {
        const target = normalizeNavigationTarget(url);
        await gotoWithFallback(newPage, target.targetUrl);
      }
      activePage = newPage;
      const pages = getPages();
      const title = await safePageTitle(newPage);
      consumeLaunchNotice();
      return {
        index: pages.indexOf(newPage),
        url: newPage.url(),
        title,
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

    /* ── Headless mode ── */

    async setHeadless(value: boolean) {
      if (value === headless) return;
      const previousMode = headless;
      headless = value;
      launchNotice = null;
      await closeBrowser();
      try {
        await ensureContext();
      } catch (error) {
        headless = previousMode;
        await closeBrowser();
        throw error;
      }
    },

    isHeadless() {
      return headless;
    },

    /* ── Lifecycle ── */

    async close() {
      await closeBrowser();
    },
  };
}
