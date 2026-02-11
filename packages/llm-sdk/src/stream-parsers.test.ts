import { describe, it, expect } from "vitest";
import { parseSseLines, extractJson, parsePlanFromRaw } from "./stream-parsers.js";

describe("parseSseLines", () => {
  it("parses simple data lines", () => {
    const lines = [...parseSseLines("data: hello\ndata: world")];
    expect(lines).toEqual([
      { event: undefined, data: "hello" },
      { event: undefined, data: "world" },
    ]);
  });

  it("parses event + data pairs", () => {
    const lines = [...parseSseLines("event: message\ndata: {\"type\":\"delta\"}")];
    expect(lines).toEqual([
      { event: "message", data: '{"type":"delta"}' },
    ]);
  });

  it("ignores non-data lines", () => {
    const lines = [...parseSseLines(": comment\ndata: ok\nrandom line")];
    expect(lines).toEqual([{ event: undefined, data: "ok" }]);
  });

  it("handles empty input", () => {
    const lines = [...parseSseLines("")];
    expect(lines).toEqual([]);
  });
});

describe("extractJson", () => {
  it("extracts JSON from raw text", () => {
    const result = extractJson('some text {"key": "value"} more text');
    expect(result).toEqual({ key: "value" });
  });

  it("throws when no JSON found", () => {
    expect(() => extractJson("no json here")).toThrow("No JSON object");
  });

  it("extracts nested JSON", () => {
    const result = extractJson('{"a": {"b": 1}}');
    expect(result).toEqual({ a: { b: 1 } });
  });
});

describe("parsePlanFromRaw", () => {
  it("parses valid plan", () => {
    const raw = JSON.stringify({ version: 1, steps: [{ id: "s1" }], agentId: "default" });
    const plan = parsePlanFromRaw(raw);
    expect(plan.version).toBe(1);
    expect(plan.steps).toHaveLength(1);
  });

  it("throws for missing version", () => {
    expect(() => parsePlanFromRaw(JSON.stringify({ steps: [] }))).toThrow("Invalid PlanGraph");
  });

  it("throws for missing steps", () => {
    expect(() => parsePlanFromRaw(JSON.stringify({ version: 1 }))).toThrow("Invalid PlanGraph");
  });

  it("extracts plan from surrounding text", () => {
    const raw = `Here is the plan: ${JSON.stringify({ version: 1, steps: [], agentId: "x" })} done.`;
    const plan = parsePlanFromRaw(raw);
    expect(plan.version).toBe(1);
  });
});
