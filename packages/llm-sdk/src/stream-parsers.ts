export type SSELine = { event?: string; data: string };

export function* parseSseLines(buffer: string): Generator<SSELine> {
  const lines = buffer.split("\n");
  let currentEvent: string | undefined;

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
      continue;
    }
    if (line.startsWith("data: ")) {
      const data = line.slice(6).trim();
      yield { event: currentEvent, data };
      currentEvent = undefined;
    }
  }
}

export async function* readSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<SSELine> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      for (const line of parseSseLines(part)) {
        yield line;
      }
    }
  }

  if (buffer.trim()) {
    for (const line of parseSseLines(buffer)) {
      yield line;
    }
  }
}

export async function* readNdjsonStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line);
      } catch {
        continue;
      }
    }
  }
}

export function extractJson(raw: string): unknown {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in response");
  return JSON.parse(match[0]);
}

export function parsePlanFromRaw(raw: string): import("@undoable/shared").PlanGraph {
  const parsed = extractJson(raw) as Record<string, unknown>;
  if (!parsed.version || !parsed.steps) throw new Error("Invalid PlanGraph structure");
  return parsed as unknown as import("@undoable/shared").PlanGraph;
}
