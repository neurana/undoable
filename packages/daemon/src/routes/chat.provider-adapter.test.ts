import { afterEach, describe, expect, it, vi } from "vitest";
import { callLLM, type ChatRouteConfig } from "./chat.js";

describe("callLLM provider adapters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses Anthropic messages API and normalizes tool output", async () => {
    const config: ChatRouteConfig = {
      apiKey: "anthropic-test-key",
      model: "claude-sonnet-4-5-20250514",
      baseUrl: "https://api.anthropic.com/v1",
      provider: "anthropic",
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "Sure." },
            {
              type: "tool_use",
              id: "toolu_123",
              name: "read_file",
              input: { path: "README.md" },
            },
          ],
          usage: { input_tokens: 12, output_tokens: 8 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await callLLM(
      config,
      [{ role: "user", content: "Read the readme" }],
      [
        {
          type: "function",
          function: {
            name: "read_file",
            description: "Read file",
            parameters: { type: "object", properties: { path: { type: "string" } } },
          },
        },
      ],
      false,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init as RequestInit)?.method).toBe("POST");
    expect((init as RequestInit)?.headers).toMatchObject({
      "x-api-key": "anthropic-test-key",
      "anthropic-version": "2023-06-01",
    });

    expect(result).toEqual({
      content: "Sure.",
      tool_calls: [
        {
          id: "toolu_123",
          type: "function",
          function: {
            name: "read_file",
            arguments: JSON.stringify({ path: "README.md" }),
          },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    });
  });

  it("converts Anthropic SSE stream into OpenAI-compatible delta stream", async () => {
    const config: ChatRouteConfig = {
      apiKey: "anthropic-test-key",
      model: "claude-sonnet-4-5-20250514",
      baseUrl: "https://api.anthropic.com/v1",
      provider: "anthropic",
    };

    const anthropicSse = [
      'event: message_start\n' +
        'data: {"type":"message_start","message":{"usage":{"input_tokens":7}}}\n',
      'event: content_block_start\n' +
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n',
      'event: content_block_delta\n' +
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n',
      'event: content_block_start\n' +
        'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_abc","name":"read_file"}}\n',
      'event: content_block_delta\n' +
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"README.md\\"}"}}\n',
      'event: message_delta\n' +
        'data: {"type":"message_delta","usage":{"output_tokens":3}}\n',
      'event: message_stop\n' +
        'data: {"type":"message_stop"}\n',
    ].join("\n");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(anthropicSse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const response = await callLLM(
      config,
      [{ role: "user", content: "Hi" }],
      [],
      true,
    );

    expect(response).toBeInstanceOf(Response);
    const transformed = await response.text();
    expect(transformed).toContain('"delta":{"content":"Hello"}');
    expect(transformed).toContain('"tool_calls":[{"index":0,"id":"toolu_abc"');
    expect(transformed).toContain('"arguments":"{\\"path\\":\\"README.md\\"}"');
    expect(transformed).toContain('"usage":{"prompt_tokens":7,"completion_tokens":3,"total_tokens":10}');
    expect(transformed).toContain("data: [DONE]");
  });
});
