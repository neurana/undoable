import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWebSearchTool } from "./search-tool.js";

const braveResponse = {
  web: {
    results: [
      { title: "Result 1", url: "https://example.com/1", description: "First result", page_age: "2d" },
      { title: "Result 2", url: "https://sub.example.org/2", description: "Second result" },
    ],
  },
};

const duckHtml = `
<html><body>
  <div class="result">
    <a class="result__a" href="/l/?uddg=https%3A%2F%2Fnews.example.com%2Faapl">Apple News</a>
    <div class="result__snippet">Apple stock rises after earnings beat.</div>
  </div>
  <div class="result">
    <a class="result__a" href="https://markets.example.org/fed">Fed Watch</a>
    <a class="result__snippet">Investors await the next Fed decision.</a>
  </div>
</body></html>
`;

let tool: ReturnType<typeof createWebSearchTool>;

beforeEach(() => {
  tool = createWebSearchTool();
  vi.stubEnv("BRAVE_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function mockBraveFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify(braveResponse), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

function mockDuckFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(duckHtml, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  );
}

describe("web_search tool", () => {
  it("has correct tool definition", () => {
    expect(tool.name).toBe("web_search");
    expect(tool.definition.function.name).toBe("web_search");
    const params = tool.definition.function.parameters as { properties: Record<string, unknown>; required: string[] };
    expect(params.properties).toHaveProperty("query");
    expect(params.properties).toHaveProperty("count");
    expect(params.properties).toHaveProperty("freshness");
    expect(params.properties).toHaveProperty("country");
    expect(params.properties).toHaveProperty("search_lang");
    expect(params.properties).toHaveProperty("ui_lang");
    expect(params.properties).toHaveProperty("safe_search");
    expect(params.required).toEqual(["query"]);
  });

  it("falls back to DuckDuckGo when BRAVE_API_KEY is missing", async () => {
    vi.stubEnv("BRAVE_API_KEY", "");
    delete process.env.BRAVE_API_KEY;
    mockDuckFetch();

    const result = (await tool.execute({ query: "latest stock market news" })) as {
      provider: string;
      count: number;
      warnings?: string[];
      results: Array<{ title: string; url: string; siteName?: string }>;
    };

    expect(result.provider).toBe("duckduckgo");
    expect(result.count).toBe(2);
    expect(result.results[0]!.title).toBe("Apple News");
    expect(result.results[0]!.url).toBe("https://news.example.com/aapl");
    expect(result.results[0]!.siteName).toBe("news.example.com");
    expect(result.warnings?.join(" ")).toContain("BRAVE_API_KEY is not configured");
  });

  it("returns error for empty query", async () => {
    const result = (await tool.execute({ query: "  " })) as { error: string };
    expect(result.error).toContain("empty");
  });

  it("calls Brave API with correct parameters", async () => {
    const fetchSpy = mockBraveFetch();

    const result = (await tool.execute({ query: "typescript tutorials", count: 2 })) as {
      query: string;
      provider: string;
      count: number;
      results: unknown[];
    };

    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("q")).toBe("typescript tutorials");
    expect(url.searchParams.get("count")).toBe("2");
    expect(result.query).toBe("typescript tutorials");
    expect(result.provider).toBe("brave");
    expect(result.count).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it("passes freshness shorthand parameter", async () => {
    const fetchSpy = mockBraveFetch();
    await tool.execute({ query: "latest news", freshness: "pd" });
    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("freshness")).toBe("pd");
  });

  it("passes freshness date range parameter", async () => {
    const fetchSpy = mockBraveFetch();
    await tool.execute({ query: "range test", freshness: "2024-01-01to2024-06-30" });
    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("freshness")).toBe("2024-01-01to2024-06-30");
  });

  it("rejects invalid freshness values", async () => {
    const result = (await tool.execute({ query: "test", freshness: "invalid" })) as { error: string };
    expect(result.error).toContain("Invalid freshness");
  });

  it("rejects reversed date range", async () => {
    const result = (await tool.execute({ query: "test", freshness: "2024-06-30to2024-01-01" })) as { error: string };
    expect(result.error).toContain("before end");
  });

  it("passes locale parameters to API", async () => {
    const fetchSpy = mockBraveFetch();
    await tool.execute({ query: "notícias", country: "br", search_lang: "pt", ui_lang: "pt" });
    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("country")).toBe("BR");
    expect(url.searchParams.get("search_lang")).toBe("pt");
    expect(url.searchParams.get("ui_lang")).toBe("pt");
  });

  it("normalizes results with siteName and published fields", async () => {
    mockBraveFetch();

    const result = (await tool.execute({ query: "test brave fields" })) as {
      results: { title: string; url: string; description: string; siteName?: string; published?: string }[];
    };

    expect(result.results[0]!.published).toBe("2d");
    expect(result.results[0]!.siteName).toBe("example.com");
    expect(result.results[1]!.published).toBeUndefined();
    expect(result.results[1]!.siteName).toBe("sub.example.org");
  });

  it("clamps count between 1 and 10", async () => {
    const fetchSpy = mockBraveFetch();

    await tool.execute({ query: "clamp-high", count: 50 });
    let url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("count")).toBe("10");

    await tool.execute({ query: "clamp-low", count: -5 });
    url = new URL(fetchSpy.mock.calls[1]![0] as string);
    expect(url.searchParams.get("count")).toBe("1");
  });

  it("falls back to DuckDuckGo when Brave API errors", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(duckHtml, { status: 200, headers: { "content-type": "text/html" } }));

    const result = (await tool.execute({ query: "stock market movers today" })) as {
      provider: string;
      warnings?: string[];
      results: Array<{ title: string }>;
    };

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe("duckduckgo");
    expect(result.results[0]!.title).toBe("Apple News");
    expect(result.warnings?.join(" ")).toContain("Brave search failed");
  });

  it("returns error when both Brave and fallback fail", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("down", { status: 503 }));

    const result = (await tool.execute({ query: "both fail query" })) as { error: string };
    expect(result.error).toContain("Brave and fallback search failed");
  });

  it("handles empty results gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ web: { results: [] } }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    const result = (await tool.execute({ query: "obscure nonsense zzz" })) as { results: unknown[]; count: number };
    expect(result.results).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("uses cache for repeated queries", async () => {
    const fetchSpy = mockBraveFetch();

    await tool.execute({ query: "cached query", count: 5 });
    await tool.execute({ query: "cached query", count: 5 });

    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("passes safe_search parameter to API", async () => {
    const fetchSpy = mockBraveFetch();
    await tool.execute({ query: "kids content", safe_search: "strict" });
    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("safesearch")).toBe("strict");
  });

  it("cache key differentiates by locale", async () => {
    const fetchSpy = mockBraveFetch();

    await tool.execute({ query: "same query locale", country: "US" });
    await tool.execute({ query: "same query locale", country: "BR" });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
