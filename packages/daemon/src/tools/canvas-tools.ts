import type { AgentTool } from "./types.js";
import type { CanvasService } from "../services/canvas-service.js";
import type { BrowserService } from "../services/browser-service.js";

const CANVAS_ACTIONS = [
  "present",
  "hide",
  "navigate",
  "eval",
  "snapshot",
  "a2ui_push",
  "a2ui_reset",
  "status",
] as const;

export function createCanvasTool(
  canvasService: CanvasService,
  browserSvc?: BrowserService,
): AgentTool {
  return {
    name: "canvas",
    definition: {
      type: "function",
      function: {
        name: "canvas",
        description: [
          "Live Canvas: agent-driven visual workspace for web surfaces and A2UI frames.",
          "Actions:",
          "  present — show canvas (opens default canvas host if no target is set)",
          "  hide — hide canvas",
          "  navigate — load a URL in the canvas",
          "  eval — execute JavaScript in the canvas context",
          "  snapshot — capture canvas as screenshot",
          "  a2ui_push — push A2UI JSONL frames to render",
          "  a2ui_reset — clear all A2UI frames",
          "  status — inspect current canvas state",
        ].join("\n"),
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: [...CANVAS_ACTIONS],
              description: "Canvas action to perform",
            },
            url: { type: "string", description: "URL for navigate" },
            script: { type: "string", description: "JavaScript for eval" },
            jsonl: { type: "string", description: "A2UI JSONL frames for a2ui_push" },
            x: { type: "number", description: "X position for present" },
            y: { type: "number", description: "Y position for present" },
            width: { type: "number", description: "Width for present" },
            height: { type: "number", description: "Height for present" },
          },
          required: ["action"],
        },
      },
    },
    execute: async (args) => {
      const action = args.action as string;
      try {
        switch (action) {
          case "present": {
            canvasService.present({
              x: args.x as number | undefined,
              y: args.y as number | undefined,
              width: args.width as number | undefined,
              height: args.height as number | undefined,
            });
            return { result: "Canvas shown", canvas: canvasService.getState() };
          }

          case "hide": {
            canvasService.hide();
            return { result: "Canvas hidden" };
          }

          case "navigate": {
            const url = args.url as string;
            if (!url) return { error: "url is required for navigate" };
            canvasService.navigate(url);
            return { result: `Canvas navigated to ${url}`, canvas: canvasService.getState() };
          }

          case "eval": {
            const script = args.script as string;
            if (!script) return { error: "script is required for eval" };
            if (!browserSvc) return { error: "Browser service not available for eval" };
            const result = await browserSvc.evaluate(script);
            return { result };
          }

          case "snapshot": {
            if (!browserSvc) return { error: "Browser service not available for snapshot" };
            const b64 = await browserSvc.screenshot();
            return { result: "Canvas snapshot captured", base64Length: b64.length };
          }

          case "a2ui_push": {
            const jsonl = args.jsonl as string;
            if (!jsonl) return { error: "jsonl is required for a2ui_push" };
            canvasService.pushFrames(jsonl);
            const state = canvasService.getState();
            return { result: "Frames pushed", totalFrames: state.frames.length };
          }

          case "a2ui_reset": {
            canvasService.resetFrames();
            return { result: "Canvas frames reset" };
          }

          case "status": {
            return { result: "Canvas state", canvas: canvasService.getState() };
          }

          default:
            return { error: `Unknown canvas action: ${action}` };
        }
      } catch (err) {
        return { error: `Canvas ${action} failed: ${(err as Error).message}` };
      }
    },
  };
}
