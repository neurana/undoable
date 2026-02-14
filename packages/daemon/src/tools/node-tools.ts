import type { AgentTool } from "./types.js";
import type { ConnectorRegistry } from "../connectors/connector-registry.js";

const NODE_ACTIONS = [
  "status",
  "describe",
  "notify",
  "camera_snap",
  "camera_list",
  "camera_clip",
  "screen_record",
  "location_get",
  "run",
] as const;

const NOTIFY_PRIORITIES = ["passive", "active", "timeSensitive"] as const;
const CAMERA_FACING = ["front", "back"] as const;
const LOCATION_ACCURACY = ["coarse", "balanced", "precise"] as const;

function resolveNode(registry: ConnectorRegistry, nodeId?: string): string {
  if (nodeId) return nodeId;
  const connected = registry.listConnected();
  if (connected.length === 0) throw new Error("No connected nodes. Use connector tools to add a device.");
  return connected[0]!.nodeId;
}

export function createNodeTools(registry: ConnectorRegistry): AgentTool[] {
  const nodeTool: AgentTool = {
    name: "nodes",
    definition: {
      type: "function",
      function: {
        name: "nodes",
        description: [
          "Interact with connected devices (phones, tablets, desktops) for camera, screen, location, and notifications.",
          "Actions:",
          "  status — list connected nodes with capabilities",
          "  describe — get detailed info about a specific node",
          "  notify — send a push notification to a device",
          "  camera_snap — take a photo (front/back camera)",
          "  camera_list — list available cameras on the device",
          "  camera_clip — record a short video clip",
          "  screen_record — record the screen for a duration",
          "  location_get — get device GPS location",
          "  run — execute a shell command on a remote node",
        ].join("\n"),
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: [...NODE_ACTIONS],
              description: "Node action to perform",
            },
            node: { type: "string", description: "Node ID (optional — uses first connected node if omitted)" },
            /* notify */
            title: { type: "string", description: "Notification title" },
            body: { type: "string", description: "Notification body" },
            priority: {
              type: "string",
              enum: [...NOTIFY_PRIORITIES],
              description: "Notification priority (default: active)",
            },
            /* camera */
            facing: {
              type: "string",
              enum: [...CAMERA_FACING],
              description: "Camera facing (default: back)",
            },
            quality: { type: "number", description: "Image quality 1-100 (default: 80)" },
            maxWidth: { type: "number", description: "Max image width in pixels" },
            durationMs: { type: "number", description: "Recording duration in ms (default: 5000)" },
            includeAudio: { type: "boolean", description: "Include audio in video clip" },
            /* location */
            accuracy: {
              type: "string",
              enum: [...LOCATION_ACCURACY],
              description: "Location accuracy (default: balanced)",
            },
            /* run */
            command: { type: "string", description: "Shell command for run action" },
            timeoutMs: { type: "number", description: "Timeout in ms for remote commands" },
          },
          required: ["action"],
        },
      },
    },
    execute: async (args) => {
      const action = args.action as string;
      try {
        switch (action) {
          case "status": {
            const nodes = registry.listConnected();
            return {
              nodes: nodes.map((n) => ({
                nodeId: n.nodeId,
                displayName: n.displayName,
                platform: n.platform,
                connectorType: n.connectorType,
                capabilities: n.capabilities,
                commands: n.commands,
              })),
              total: nodes.length,
            };
          }

          case "describe": {
            const nodeId = resolveNode(registry, args.node as string | undefined);
            const connector = registry.get(nodeId);
            if (!connector) return { error: `Node '${nodeId}' not found` };
            return { node: connector.info() };
          }

          case "notify": {
            const nodeId = resolveNode(registry, args.node as string | undefined);
            const result = await registry.invoke(nodeId, "system.notify", {
              title: args.title as string ?? "Notification",
              body: args.body as string ?? "",
              priority: args.priority as string ?? "active",
            });
            return result.ok
              ? { result: "Notification sent", nodeId }
              : { error: result.error?.message ?? "Notification failed" };
          }

          case "camera_snap": {
            const nodeId = resolveNode(registry, args.node as string | undefined);
            const result = await registry.invoke(nodeId, "camera.snap", {
              facing: args.facing as string ?? "back",
              quality: args.quality as number ?? 80,
              maxWidth: args.maxWidth as number | undefined,
              format: "jpg",
            });
            if (!result.ok) return { error: result.error?.message ?? "Camera snap failed" };
            return { result: "Photo captured", nodeId, payload: result.payload };
          }

          case "camera_list": {
            const nodeId = resolveNode(registry, args.node as string | undefined);
            const result = await registry.invoke(nodeId, "camera.list", {});
            if (!result.ok) return { error: result.error?.message ?? "Camera list failed" };
            return { cameras: result.payload, nodeId };
          }

          case "camera_clip": {
            const nodeId = resolveNode(registry, args.node as string | undefined);
            const result = await registry.invoke(nodeId, "camera.clip", {
              facing: args.facing as string ?? "back",
              durationMs: args.durationMs as number ?? 5000,
              includeAudio: args.includeAudio as boolean ?? false,
              quality: args.quality as number ?? 80,
              maxWidth: args.maxWidth as number | undefined,
            });
            if (!result.ok) return { error: result.error?.message ?? "Camera clip failed" };
            return { result: "Video clip recorded", nodeId, payload: result.payload };
          }

          case "screen_record": {
            const nodeId = resolveNode(registry, args.node as string | undefined);
            const result = await registry.invoke(nodeId, "screen.record", {
              durationMs: args.durationMs as number ?? 5000,
            });
            if (!result.ok) return { error: result.error?.message ?? "Screen recording failed" };
            return { result: "Screen recorded", nodeId, payload: result.payload };
          }

          case "location_get": {
            const nodeId = resolveNode(registry, args.node as string | undefined);
            const result = await registry.invoke(nodeId, "location.get", {
              desiredAccuracy: args.accuracy as string ?? "balanced",
            });
            if (!result.ok) return { error: result.error?.message ?? "Location request failed" };
            return { location: result.payload, nodeId };
          }

          case "run": {
            const nodeId = resolveNode(registry, args.node as string | undefined);
            const command = args.command as string;
            if (!command) return { error: "command is required for run action" };
            const result = await registry.exec(nodeId, command, {
              timeout: args.timeoutMs as number | undefined,
            });
            return {
              nodeId,
              exitCode: result.exitCode,
              stdout: result.stdout.slice(0, 8000),
              stderr: result.stderr.slice(0, 4000),
              durationMs: result.durationMs,
            };
          }

          default:
            return { error: `Unknown node action: ${action}` };
        }
      } catch (err) {
        return { error: `Node ${action} failed: ${(err as Error).message}` };
      }
    },
  };

  return [nodeTool];
}
