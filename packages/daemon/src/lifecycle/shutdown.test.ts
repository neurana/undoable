import { describe, it, expect } from "vitest";
import { GracefulShutdown } from "./shutdown.js";

describe("GracefulShutdown", () => {
  it("starts not shutting down", () => {
    const gs = new GracefulShutdown();
    expect(gs.isShuttingDown()).toBe(false);
  });

  it("registers and executes handlers", async () => {
    const gs = new GracefulShutdown();
    const calls: string[] = [];
    gs.register(() => { calls.push("a"); });
    gs.register(() => { calls.push("b"); });

    await gs.executeHandlers();
    expect(calls).toEqual(["a", "b"]);
  });

  it("handles async handlers", async () => {
    const gs = new GracefulShutdown();
    const calls: string[] = [];
    gs.register(async () => {
      await new Promise((r) => setTimeout(r, 10));
      calls.push("async");
    });

    await gs.executeHandlers();
    expect(calls).toEqual(["async"]);
  });

  it("continues on handler error", async () => {
    const gs = new GracefulShutdown();
    const calls: string[] = [];
    gs.register(() => { throw new Error("fail"); });
    gs.register(() => { calls.push("ok"); });

    await gs.executeHandlers();
    expect(calls).toEqual(["ok"]);
  });
});
