import type { AgentTool } from "./types.js";

const BRAVE_API = "https://api.search.brave.com/res/v1/web/search";
const DUCKDUCKGO_HTML = "https://html.duckduckgo.com/html/";
const CACHE_TTL = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;
const FETCH_TIMEOUT = 10_000;
const DATE_RANGE_RE = /^\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2}$/;
const SHORTHAND_FRESHNESS = new Set(["pd", "pw", "pm", "py"]);
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 Chrome/122 Safari/537.36";

type CacheEntry = { ts: number; data: unknown };
const cache = new Map<string, CacheEntry>();

type SearchResult = {
  title: string;
  url: string;
  description: string;
  siteName?: string;
  published?: string;
};

type SearchResponse = {
  query: string;
  provider: "brave" | "duckduckgo";
  count: number;
  tookMs: number;
  results: SearchResult[];
  warnings?: string[];
};

type BraveResult = {
  title: string;
  url: string;
  description: string;
  page_age?: string;
};

type BraveResponse = {
  web?: { results: BraveResult[] };
};

type SearchArgs = {
  query: string;
  count: number;
  freshness?: string;
  country?: string;
  searchLang?: string;
  uiLang?: string;
  safeSearch?: string;
};

function cacheKey(
  mode: string,
  query: string,
  count: number,
  freshness?: string,
  country?: string,
  lang?: string,
): string {
  return `${mode}|${query}|${count}|${freshness ?? ""}|${country ?? ""}|${lang ?? ""}`;
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

function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower in named) return named[lower]!;
    if (lower.startsWith("#x")) {
      const cp = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    }
    if (lower.startsWith("#")) {
      const cp = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    }
    return match;
  });
}

function cleanText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDuckDuckGoUrl(rawHref: string): string | undefined {
  if (!rawHref) return undefined;
  try {
    const absolute = rawHref.startsWith("//")
      ? `https:${rawHref}`
      : rawHref.startsWith("/")
        ? new URL(rawHref, "https://duckduckgo.com").toString()
        : rawHref;

    if (absolute.startsWith("javascript:")) return undefined;

    const parsed = new URL(absolute);
    if (parsed.hostname === "duckduckgo.com" && parsed.pathname.startsWith("/l/")) {
      const target = parsed.searchParams.get("uddg");
      if (target) return target;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function parseDuckDuckGoResults(html: string, count: number): SearchResult[] {
  const links: Array<{ url: string; title: string }> = [];
  const snippets: string[] = [];
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi;

  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const url = normalizeDuckDuckGoUrl(match[1] ?? "");
    const title = cleanText(match[2] ?? "");
    if (!url || !title) continue;
    links.push({ url, title });
    if (links.length >= count) break;
  }

  while ((match = snippetRe.exec(html)) !== null) {
    const snippet = cleanText(match[1] ?? "");
    snippets.push(snippet);
    if (snippets.length >= count) break;
  }

  return links.map((entry, idx) => ({
    title: entry.title,
    url: entry.url,
    description: snippets[idx] ?? "",
    siteName: extractSiteName(entry.url),
  }));
}

async function searchBrave(args: SearchArgs, apiKey: string): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: args.query, count: String(args.count) });
  if (args.freshness) params.set("freshness", args.freshness);
  if (args.country) params.set("country", args.country.toUpperCase());
  if (args.searchLang) params.set("search_lang", args.searchLang.toLowerCase());
  if (args.uiLang) params.set("ui_lang", args.uiLang.toLowerCase());
  if (args.safeSearch) params.set("safesearch", args.safeSearch);

  const start = Date.now();
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
    throw new Error(`Brave API error ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as BraveResponse;
  const results = (json.web?.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    description: r.description,
    siteName: extractSiteName(r.url),
    published: r.page_age,
  }));

  return {
    query: args.query,
    provider: "brave",
    count: results.length,
    tookMs: Date.now() - start,
    results,
  };
}

async function searchDuckDuckGo(args: SearchArgs, baseWarnings: string[] = []): Promise<SearchResponse> {
  const warnings = [...baseWarnings];
  if (args.freshness) warnings.push("freshness filtering is not available in the fallback provider.");
  if (args.safeSearch) warnings.push("safe_search filtering is not available in the fallback provider.");
  if (args.country || args.searchLang || args.uiLang) {
    warnings.push("country/language hints are best-effort in the fallback provider.");
  }

  const start = Date.now();
  const params = new URLSearchParams({ q: args.query });
  const res = await fetch(`${DUCKDUCKGO_HTML}?${params}`, {
    headers: {
      Accept: "text/html",
      "User-Agent": DEFAULT_USER_AGENT,
      "Accept-Language": args.uiLang ? `${args.uiLang},en;q=0.8` : "en-US,en;q=0.8",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DuckDuckGo HTML error ${res.status}: ${body.slice(0, 300)}`);
  }

  const html = await res.text();
  const results = parseDuckDuckGoResults(html, args.count);

  return {
    query: args.query,
    provider: "duckduckgo",
    count: results.length,
    tookMs: Date.now() - start,
    results,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export function createWebSearchTool(): AgentTool {
  return {
    name: "web_search",
    definition: {
      type: "function",
      function: {
        name: "web_search",
        description:
          "Search the web. Uses Brave Search API when BRAVE_API_KEY is configured, otherwise falls back to DuckDuckGo HTML search. Returns titles, URLs, and descriptions for top results.",
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
      const query = args.query as string;
      if (!query?.trim()) {
        return { error: "Search query cannot be empty" };
      }

      const searchArgs: SearchArgs = {
        query,
        count: Math.min(10, Math.max(1, (args.count as number) ?? 5)),
        freshness: args.freshness as string | undefined,
        country: args.country as string | undefined,
        searchLang: args.search_lang as string | undefined,
        uiLang: args.ui_lang as string | undefined,
        safeSearch: args.safe_search as string | undefined,
      };

      if (searchArgs.freshness) {
        const check = validateFreshness(searchArgs.freshness);
        if (!check.valid) return { error: check.error };
      }

      const apiKey = process.env.BRAVE_API_KEY?.trim();
      const mode = apiKey ? "brave" : "duckduckgo";
      const key = cacheKey(
        mode,
        searchArgs.query,
        searchArgs.count,
        searchArgs.freshness,
        searchArgs.country,
        searchArgs.searchLang,
      );
      const cached = getCached(key);
      if (cached) return cached;

      if (apiKey) {
        try {
          const data = await searchBrave(searchArgs, apiKey);
          cache.set(key, { ts: Date.now(), data });
          evictCache();
          return data;
        } catch (braveErr) {
          try {
            const data = await searchDuckDuckGo(searchArgs, [
              `Brave search failed: ${braveErr instanceof Error ? braveErr.message : String(braveErr)}`,
            ]);
            cache.set(key, { ts: Date.now(), data });
            evictCache();
            return data;
          } catch (fallbackErr) {
            return {
              error: `Brave and fallback search failed. ${braveErr instanceof Error ? braveErr.message : String(braveErr)} | ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
            };
          }
        }
      }

      try {
        const data = await searchDuckDuckGo(searchArgs, [
          "BRAVE_API_KEY is not configured; using fallback provider.",
        ]);
        cache.set(key, { ts: Date.now(), data });
        evictCache();
        return data;
      } catch (fallbackErr) {
        return {
          error: `Fallback search failed and BRAVE_API_KEY is not configured. ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
        };
      }
    },
  };
}
