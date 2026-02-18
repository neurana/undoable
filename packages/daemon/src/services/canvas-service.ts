import type { EventBus } from "@undoable/core";
import type { EventType } from "@undoable/shared";
import { CANVAS_DEFAULT_URL } from "./canvas-constants.js";

export type CanvasState = {
  visible: boolean;
  url?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  frames: string[];
};

export class CanvasService {
  private state: CanvasState = { visible: false, frames: [] };
  private eventBus?: EventBus;
  private runId?: string;

  bind(eventBus: EventBus, runId: string) {
    this.eventBus = eventBus;
    this.runId = runId;
  }

  private emit(type: EventType, payload: Record<string, unknown> = {}) {
    if (this.eventBus && this.runId) {
      this.eventBus.emit(this.runId, type, payload, "system");
    }
  }

  getState(): CanvasState {
    return { ...this.state };
  }

  present(opts?: { x?: number; y?: number; width?: number; height?: number }) {
    this.state.visible = true;
    if (!this.state.url && this.state.frames.length === 0) {
      this.state.url = CANVAS_DEFAULT_URL;
    }
    if (opts?.x !== undefined) this.state.x = opts.x;
    if (opts?.y !== undefined) this.state.y = opts.y;
    if (opts?.width !== undefined) this.state.width = opts.width;
    if (opts?.height !== undefined) this.state.height = opts.height;
    this.emit("TOOL_RESULT", {
      canvasAction: "present",
      canvas: this.getState(),
    });
  }

  hide() {
    this.state.visible = false;
    this.emit("TOOL_RESULT", {
      canvasAction: "hide",
      canvas: this.getState(),
    });
  }

  navigate(url: string) {
    this.state.url = url;
    this.state.visible = true;
    this.emit("TOOL_RESULT", {
      canvasAction: "navigate",
      canvas: this.getState(),
    });
  }

  pushFrames(jsonl: string) {
    const lines = jsonl.split("\n").filter((l) => l.trim());
    this.state.frames.push(...lines);
    this.emit("TOOL_RESULT", {
      canvasAction: "a2ui_push",
      frameCount: lines.length,
      totalFrames: this.state.frames.length,
    });
  }

  resetFrames() {
    this.state.frames = [];
    this.emit("TOOL_RESULT", {
      canvasAction: "a2ui_reset",
      totalFrames: 0,
    });
  }
}
