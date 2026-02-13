import type { AgentTool } from "./types.js";
import type { ConnectorRegistry } from "../connectors/index.js";

export function createConnectorTools(registry: ConnectorRegistry): AgentTool[] {
  return [
    {
      name: "connect",
      definition: {
        type: "function",
        function: {
          name: "connect",
          description:
            "Connect to a system. Supports: local (this machine), ssh (remote via SSH), docker (container), websocket (real-time node). Returns the node ID for subsequent commands.",
          parameters: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["local", "ssh", "docker", "websocket"],
                description: "Connector type",
              },
              host: { type: "string", description: "SSH host" },
              port: { type: "number", description: "SSH port (default: 22)" },
              username: { type: "string", description: "SSH username" },
              privateKeyPath: { type: "string", description: "SSH private key path (e.g., ~/.ssh/id_rsa)" },
              password: { type: "string", description: "SSH password (prefer key-based auth)" },
              container: { type: "string", description: "Docker container name" },
              image: { type: "string", description: "Docker image (auto-starts if container doesn't exist)" },
              url: { type: "string", description: "WebSocket URL" },
              token: { type: "string", description: "WebSocket auth token" },
              displayName: { type: "string", description: "Friendly name for the connection" },
            },
            required: ["type"],
          },
        },
      },
      execute: async (args) => {
        const type = args.type as string;
        try {
          let connector;
          switch (type) {
            case "local":
              connector = await registry.add({ type: "local", displayName: args.displayName as string });
              break;
            case "ssh":
              connector = await registry.add({
                type: "ssh",
                host: args.host as string,
                port: args.port as number | undefined,
                username: args.username as string,
                privateKeyPath: args.privateKeyPath as string | undefined,
                password: args.password as string | undefined,
                displayName: args.displayName as string | undefined,
              });
              break;
            case "docker":
              connector = await registry.add({
                type: "docker",
                container: args.container as string,
                image: args.image as string | undefined,
                displayName: args.displayName as string | undefined,
              });
              break;
            case "websocket":
              connector = await registry.add({
                type: "websocket",
                url: args.url as string,
                token: args.token as string | undefined,
                displayName: args.displayName as string | undefined,
              });
              break;
            default:
              return { error: `Unknown connector type: ${type}` };
          }
          return { connected: true, nodeId: connector.nodeId, info: connector.info() };
        } catch (err) {
          return { connected: false, error: `Connection failed: ${(err as Error).message}` };
        }
      },
    },
    {
      name: "nodes",
      definition: {
        type: "function",
        function: {
          name: "nodes",
          description:
            "Manage connected systems (nodes). Actions: list (all nodes), describe (node details), disconnect (remove node), exec (run command on node), invoke (send command to node).",
          parameters: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["list", "describe", "disconnect", "exec", "invoke"],
                description: "Action to perform",
              },
              nodeId: { type: "string", description: "Node ID (required for describe/disconnect/exec/invoke)" },
              command: { type: "string", description: "Shell command (for exec) or invoke command name" },
              cwd: { type: "string", description: "Working directory for exec" },
              env: { type: "object", description: "Environment variables for exec" },
              timeout: { type: "number", description: "Timeout in ms for exec" },
              params: { type: "object", description: "Parameters for invoke" },
            },
            required: ["action"],
          },
        },
      },
      execute: async (args) => {
        const action = args.action as string;

        if (action === "list") {
          const nodes = registry.list();
          return { nodes, total: nodes.length };
        }

        const nodeId = args.nodeId as string;
        if (!nodeId) return { error: "nodeId is required for this action" };

        switch (action) {
          case "describe": {
            const nodes = registry.list();
            const node = nodes.find((n) => n.nodeId === nodeId);
            if (!node) return { error: `Node '${nodeId}' not found` };
            return node;
          }
          case "disconnect": {
            const removed = await registry.remove(nodeId);
            return { disconnected: removed, nodeId };
          }
          case "exec": {
            const command = args.command as string;
            if (!command) return { error: "command is required for exec" };
            try {
              const result = await registry.exec(nodeId, command, {
                cwd: args.cwd as string | undefined,
                env: args.env as Record<string, string> | undefined,
                timeout: args.timeout as number | undefined,
              });
              return {
                nodeId,
                exitCode: result.exitCode,
                stdout: result.stdout.slice(0, 8000),
                stderr: result.stderr.slice(0, 4000),
                durationMs: result.durationMs,
                truncated: result.stdout.length > 8000,
              };
            } catch (err) {
              return { nodeId, error: (err as Error).message };
            }
          }
          case "invoke": {
            const command = args.command as string;
            if (!command) return { error: "command is required for invoke" };
            try {
              const result = await registry.invoke(nodeId, command, args.params);
              return { nodeId, ...result };
            } catch (err) {
              return { nodeId, ok: false, error: { message: (err as Error).message } };
            }
          }
          default:
            return { error: `Unknown action: ${action}` };
        }
      },
    },
  ];
}
