import type { AgentTool } from "./types.js";

const BRAVE_API = "https://api.search.brave.com/res/v1/web/search";
const CACHE_TTL = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;
const FETCH_TIMEOUT = 10_000;
const DATE_RANGE_RE = /^\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2}$/;
const SHORTHAND_FRESHNESS = new Set(["pd", "pw", "pm", "py"]);

type CacheEntry = { ts: number; data: unknown };
const cache = new Map<string, CacheEntry>();

type BraveResult = {
  title: string;
  url: string;
  description: string;
  page_age?: string;
};

type BraveResponse = {
  web?: { results: BraveResult[] };
};

function cacheKey(query: string, count: number, freshness?: string, country?: string, lang?: string): string {
  return `${query}|${count}|${freshness ?? ""}|${country ?? ""}|${lang ?? ""}`;
}

function getCached(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function evictCache(): void {
  if (cache.size <= CACHE_MAX_ENTRIES) return;
  let oldest: string | undefined;
  let oldestTs = Infinity;
  for (const [k, v] of cache) {
    if (v.ts < oldestTs) {
      oldestTs = v.ts;
      oldest = k;
    }
  }
  if (oldest) cache.delete(oldest);
}

function extractSiteName(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname;
  } catch {
    return undefined;
  }
}

function validateFreshness(value: string): { valid: boolean; error?: string } {
  if (SHORTHAND_FRESHNESS.has(value)) return { valid: true };
  if (DATE_RANGE_RE.test(value)) {
    const [start, end] = value.split("to");
    if (start! > end!) return { valid: false, error: `Invalid date range: start (${start}) must be before end (${end})` };
    return { valid: true };
  }
  return { valid: false, error: `Invalid freshness value: "${value}". Use pd, pw, pm, py, or YYYY-MM-DDtoYYYY-MM-DD` };
}

export function createWebSearchTool(): AgentTool {
  return {
    name: "web_search",
    definition: {
      type: "function",
      function: {
        name: "web_search",
        description:
          "Search the web using Brave Search API. Supports region-specific and localized search via country and language parameters. Returns titles, URLs, and descriptions for the top results.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            count: {
              type: "number",
              description: "Number of results (1-10, default 5)",
            },
            freshness: {
              type: "string",
              description:
                "Filter by freshness: pd=past day, pw=past week, pm=past month, py=past year, or YYYY-MM-DDtoYYYY-MM-DD date range",
            },
            country: {
              type: "string",
              description: "2-letter country code for region-specific results (e.g. US, DE, BR, ALL)",
            },
            search_lang: {
              type: "string",
              description: "ISO language code for search results (e.g. en, de, pt, fr)",
            },
            ui_lang: {
              type: "string",
              description: "ISO language code for UI elements (e.g. en, de, pt)",
            },
            safe_search: {
              type: "string",
              enum: ["off", "moderate", "strict"],
              description: "Safe search filter level (default: moderate)",
            },
          },
          required: ["query"],
        },
      },
    },
    execute: async (args) => {
      const apiKey = process.env.BRAVE_API_KEY;
      if (!apiKey) {
        return {
          error: "BRAVE_API_KEY environment variable is not set. Get a free key at https://brave.com/search/api/",
        };
      }

      const query = args.query as string;
      if (!query?.trim()) {
        return { error: "Search query cannot be empty" };
      }

      const count = Math.min(10, Math.max(1, (args.count as number) ?? 5));
      const freshness = args.freshness as string | undefined;
      const country = args.country as string | undefined;
      const searchLang = args.search_lang as string | undefined;
      const uiLang = args.ui_lang as string | undefined;
      const safeSearch = args.safe_search as string | undefined;

      if (freshness) {
        const check = validateFreshness(freshness);
        if (!check.valid) return { error: check.error };
      }

      const key = cacheKey(query, count, freshness, country, searchLang);
      const cached = getCached(key);
      if (cached) return cached;

      const start = Date.now();
      const params = new URLSearchParams({ q: query, count: String(count) });
      if (freshness) params.set("freshness", freshness);
      if (country) params.set("country", country.toUpperCase());
      if (searchLang) params.set("search_lang", searchLang.toLowerCase());
      if (uiLang) params.set("ui_lang", uiLang.toLowerCase());
      if (safeSearch) params.set("safesearch", safeSearch);

      const res = await fetch(`${BRAVE_API}?${params}`, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { error: `Brave API error ${res.status}: ${body.slice(0, 500)}` };
      }

      const json = (await res.json()) as BraveResponse;
      const results = (json.web?.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description,
        siteName: extractSiteName(r.url),
        published: r.page_age,
      }));

      const data = {
        query,
        provider: "brave",
        count: results.length,
        tookMs: Date.now() - start,
        results,
      };

      cache.set(key, { ts: Date.now(), data });
      evictCache();
      return data;
    },
  };
}
