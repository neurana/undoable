import { EventEmitter } from "node:events";
import type { EventEnvelope, EventType } from "@undoable/shared";
import { nowISO } from "@undoable/shared";

type EventHandler = (event: EventEnvelope) => void;

export class EventBus {
  private emitter = new EventEmitter();
  private counter = 0;

  emit(runId: string, type: EventType, payload?: unknown, userId?: string): EventEnvelope {
    const event: EventEnvelope = {
      eventId: ++this.counter,
      runId,
      ts: nowISO(),
      type,
      userId,
      payload,
    };
    this.emitter.emit("event", event);
    this.emitter.emit(runId, event);
    return event;
  }

  onAll(handler: EventHandler): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  onRun(runId: string, handler: EventHandler): () => void {
    this.emitter.on(runId, handler);
    return () => this.emitter.off(runId, handler);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}
