import { describe, it, expect, vi } from "vitest";
import { EventBus } from "./event-bus.js";

describe("EventBus", () => {
  it("emits events with correct structure", () => {
    const bus = new EventBus();
    const event = bus.emit("run-1", "RUN_CREATED", { foo: "bar" }, "user-1");

    expect(event.eventId).toBe(1);
    expect(event.runId).toBe("run-1");
    expect(event.type).toBe("RUN_CREATED");
    expect(event.payload).toEqual({ foo: "bar" });
    expect(event.userId).toBe("user-1");
    expect(event.ts).toBeTruthy();
  });

  it("increments event IDs", () => {
    const bus = new EventBus();
    const e1 = bus.emit("run-1", "RUN_CREATED");
    const e2 = bus.emit("run-1", "PHASE_STARTED");
    const e3 = bus.emit("run-2", "RUN_CREATED");

    expect(e1.eventId).toBe(1);
    expect(e2.eventId).toBe(2);
    expect(e3.eventId).toBe(3);
  });

  it("onAll receives all events", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.onAll(handler);

    bus.emit("run-1", "RUN_CREATED");
    bus.emit("run-2", "RUN_CREATED");

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0]![0].runId).toBe("run-1");
    expect(handler.mock.calls[1]![0].runId).toBe("run-2");
  });

  it("onRun receives only events for that run", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.onRun("run-1", handler);

    bus.emit("run-1", "RUN_CREATED");
    bus.emit("run-2", "RUN_CREATED");
    bus.emit("run-1", "PHASE_STARTED");

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("unsubscribe stops receiving events", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.onAll(handler);

    bus.emit("run-1", "RUN_CREATED");
    unsub();
    bus.emit("run-1", "PHASE_STARTED");

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe from run stops receiving run events", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.onRun("run-1", handler);

    bus.emit("run-1", "RUN_CREATED");
    unsub();
    bus.emit("run-1", "PHASE_STARTED");

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("removeAllListeners clears everything", () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.onAll(h1);
    bus.onRun("run-1", h2);

    bus.removeAllListeners();
    bus.emit("run-1", "RUN_CREATED");

    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it("handles events without payload or userId", () => {
    const bus = new EventBus();
    const event = bus.emit("run-1", "RUN_COMPLETED");

    expect(event.payload).toBeUndefined();
    expect(event.userId).toBeUndefined();
  });
});
