import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HeartbeatService } from "./heartbeat-service.js";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("HeartbeatService", () => {
  it("registers and lists sessions", () => {
    const svc = new HeartbeatService();
    svc.start();
    svc.register("s1", { agentId: "agent-1" });
    const sessions = svc.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.sessionId).toBe("s1");
    expect(sessions[0]!.agentId).toBe("agent-1");
    expect(sessions[0]!.health).toBe("alive");
    expect(sessions[0]!.sseActive).toBe(true);
    svc.stop();
  });

  it("unregister marks sseActive false", () => {
    const svc = new HeartbeatService();
    svc.start();
    svc.register("s1");
    svc.unregister("s1");
    const sessions = svc.listSessions();
    expect(sessions[0]!.sseActive).toBe(false);
    svc.stop();
  });

  it("reports stale after threshold", () => {
    const svc = new HeartbeatService({ staleThresholdMs: 100, deadThresholdMs: 500 });
    svc.start();
    svc.register("s1");
    vi.advanceTimersByTime(150);
    expect(svc.getHealth("s1")).toBe("stale");
    svc.stop();
  });

  it("reports dead after threshold", () => {
    const svc = new HeartbeatService({ staleThresholdMs: 100, deadThresholdMs: 200 });
    svc.start();
    svc.register("s1");
    vi.advanceTimersByTime(250);
    expect(svc.getHealth("s1")).toBe("dead");
    svc.stop();
  });

  it("ping resets health to alive", () => {
    const svc = new HeartbeatService({ staleThresholdMs: 100, deadThresholdMs: 500 });
    svc.start();
    svc.register("s1");
    vi.advanceTimersByTime(150);
    expect(svc.getHealth("s1")).toBe("stale");
    svc.ping("s1");
    expect(svc.getHealth("s1")).toBe("alive");
    svc.stop();
  });

  it("returns dead for unknown session", () => {
    const svc = new HeartbeatService();
    svc.start();
    expect(svc.getHealth("nonexistent")).toBe("dead");
    svc.stop();
  });

  it("calls onHeartbeat at interval", () => {
    const svc = new HeartbeatService({ heartbeatIntervalMs: 50 });
    svc.start();
    const cb = vi.fn();
    svc.register("s1", { onHeartbeat: cb });
    vi.advanceTimersByTime(150);
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0]![0]).toBe("s1");
    svc.stop();
  });

  it("cleanup removes dead sessions without active SSE", () => {
    const onDead = vi.fn();
    const svc = new HeartbeatService({
      staleThresholdMs: 50,
      deadThresholdMs: 100,
      cleanupIntervalMs: 200,
    });
    svc.start({ onSessionDead: onDead });
    svc.register("s1");
    svc.unregister("s1");
    vi.advanceTimersByTime(300);
    expect(onDead).toHaveBeenCalledWith("s1");
    expect(svc.listSessions()).toHaveLength(0);
    svc.stop();
  });

  it("does not cleanup dead sessions with active SSE", () => {
    const svc = new HeartbeatService({
      staleThresholdMs: 50,
      deadThresholdMs: 100,
      cleanupIntervalMs: 200,
    });
    svc.start();
    svc.register("s1");
    vi.advanceTimersByTime(300);
    expect(svc.listSessions()).toHaveLength(1);
    svc.stop();
  });

  it("activeCount reflects alive sessions", () => {
    const svc = new HeartbeatService({ staleThresholdMs: 100, deadThresholdMs: 500 });
    svc.start();
    svc.register("s1");
    svc.register("s2");
    expect(svc.activeCount).toBe(2);
    vi.advanceTimersByTime(150);
    expect(svc.activeCount).toBe(0);
    svc.ping("s1");
    expect(svc.activeCount).toBe(1);
    svc.stop();
  });

  it("recordActivity extends liveness", () => {
    const svc = new HeartbeatService({ staleThresholdMs: 100, deadThresholdMs: 500 });
    svc.start();
    svc.register("s1");
    vi.advanceTimersByTime(80);
    svc.recordActivity("s1");
    vi.advanceTimersByTime(80);
    expect(svc.getHealth("s1")).toBe("alive");
    svc.stop();
  });

  it("stop clears all timers and sessions", () => {
    const svc = new HeartbeatService();
    svc.start();
    svc.register("s1");
    svc.register("s2");
    svc.stop();
    expect(svc.listSessions()).toHaveLength(0);
  });
});
