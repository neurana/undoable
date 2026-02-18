import { describe, expect, it } from "vitest";
import { CanvasService } from "./canvas-service.js";
import { CANVAS_DEFAULT_URL } from "./canvas-constants.js";

describe("CanvasService", () => {
  it("defaults present() to canvas host when no URL/frames exist", () => {
    const service = new CanvasService();
    service.present();
    const state = service.getState();
    expect(state.visible).toBe(true);
    expect(state.url).toBe(CANVAS_DEFAULT_URL);
  });

  it("keeps frame mode available when A2UI frames are pushed first", () => {
    const service = new CanvasService();
    service.pushFrames("{\"kind\":\"card\"}");
    service.present();
    const state = service.getState();
    expect(state.frames).toHaveLength(1);
    expect(state.url).toBeUndefined();
    expect(state.visible).toBe(true);
  });
});
