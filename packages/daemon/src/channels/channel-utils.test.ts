import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createBackoff,
  resetBackoff,
  nextBackoffMs,
  RateLimiter,
  shouldAcceptMessage,
  isMediaWithinLimit,
  MessageQueue,
} from "./channel-utils.js";
import type { ChannelMessage } from "./types.js";

function makeMsg(overrides?: Partial<ChannelMessage>): ChannelMessage {
  return {
    id: "1",
    channelId: "telegram",
    from: "user-1",
    to: "chat-1",
    text: "hello",
    timestamp: Date.now(),
    chatType: "direct",
    ...overrides,
  };
}

describe("Backoff", () => {
  it("creates with defaults", () => {
    const b = createBackoff();
    expect(b.attempt).toBe(0);
    expect(b.maxAttempts).toBe(10);
  });

  it("returns increasing delays", () => {
    const b = createBackoff(5, 100, 10_000);
    const d1 = nextBackoffMs(b);
    const d2 = nextBackoffMs(b);
    expect(d1).toBeGreaterThanOrEqual(100);
    expect(d2).toBeGreaterThan(d1!);
  });

  it("returns null when max attempts reached", () => {
    const b = createBackoff(2, 100, 1000);
    nextBackoffMs(b);
    nextBackoffMs(b);
    expect(nextBackoffMs(b)).toBeNull();
  });

  it("reset clears attempts", () => {
    const b = createBackoff(3, 100, 1000);
    nextBackoffMs(b);
    nextBackoffMs(b);
    resetBackoff(b);
    expect(b.attempt).toBe(0);
    expect(nextBackoffMs(b)).not.toBeNull();
  });
});

describe("RateLimiter", () => {
  it("allows within limit", () => {
    const rl = new RateLimiter({ maxPerMinute: 3 });
    expect(rl.allow("u1")).toBe(true);
    expect(rl.allow("u1")).toBe(true);
    expect(rl.allow("u1")).toBe(true);
  });

  it("blocks over limit", () => {
    const rl = new RateLimiter({ maxPerMinute: 2 });
    rl.allow("u1");
    rl.allow("u1");
    expect(rl.allow("u1")).toBe(false);
  });

  it("tracks per user", () => {
    const rl = new RateLimiter({ maxPerMinute: 1 });
    expect(rl.allow("u1")).toBe(true);
    expect(rl.allow("u2")).toBe(true);
    expect(rl.allow("u1")).toBe(false);
  });

  it("reset clears all buckets", () => {
    const rl = new RateLimiter({ maxPerMinute: 1 });
    rl.allow("u1");
    expect(rl.allow("u1")).toBe(false);
    rl.reset();
    expect(rl.allow("u1")).toBe(true);
  });
});

describe("shouldAcceptMessage", () => {
  it("accepts by default", () => {
    expect(shouldAcceptMessage(makeMsg())).toBe(true);
  });

  it("rejects DM when allowDMs=false", () => {
    expect(shouldAcceptMessage(makeMsg({ chatType: "direct" }), { allowDMs: false })).toBe(false);
  });

  it("rejects group when allowGroups=false", () => {
    expect(shouldAcceptMessage(makeMsg({ chatType: "group" }), { allowGroups: false })).toBe(false);
  });

  it("rejects blocked user", () => {
    expect(shouldAcceptMessage(makeMsg({ from: "bad" }), { userBlocklist: ["bad"] })).toBe(false);
  });

  it("rejects non-allowlisted user", () => {
    expect(shouldAcceptMessage(makeMsg({ from: "other" }), { userAllowlist: ["vip"] })).toBe(false);
  });

  it("accepts allowlisted user", () => {
    expect(shouldAcceptMessage(makeMsg({ from: "vip" }), { userAllowlist: ["vip"] })).toBe(true);
  });
});

describe("isMediaWithinLimit", () => {
  it("allows within limit", () => {
    expect(isMediaWithinLimit(1000, 5000)).toBe(true);
  });

  it("rejects over limit", () => {
    expect(isMediaWithinLimit(6000, 5000)).toBe(false);
  });

  it("uses default 10MB limit", () => {
    expect(isMediaWithinLimit(5 * 1024 * 1024)).toBe(true);
    expect(isMediaWithinLimit(11 * 1024 * 1024)).toBe(false);
  });
});

describe("MessageQueue", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("queues and processes after debounce", async () => {
    const processed: string[] = [];
    const q = new MessageQueue(async (msg) => { processed.push(msg.id); }, { debounceMs: 100 });

    q.enqueue(makeMsg({ id: "a" }));
    q.enqueue(makeMsg({ id: "b" }));
    expect(q.pending).toBe(2);

    await vi.advanceTimersByTimeAsync(150);
    expect(processed).toEqual(["a", "b"]);
    expect(q.pending).toBe(0);
  });

  it("respects max queue size", () => {
    const q = new MessageQueue(async () => { }, { maxQueueSize: 2 });
    q.enqueue(makeMsg({ id: "a" }));
    q.enqueue(makeMsg({ id: "b" }));
    q.enqueue(makeMsg({ id: "c" }));
    expect(q.pending).toBe(2);
  });

  it("clear empties queue", () => {
    const q = new MessageQueue(async () => { });
    q.enqueue(makeMsg({ id: "a" }));
    q.clear();
    expect(q.pending).toBe(0);
  });
});
