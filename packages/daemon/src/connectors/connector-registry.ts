import type { Connector, ConnectorConfig, NodeInfo, InvokeResult, ExecResult, ExecOptions } from "./types.js";
import { LocalConnector } from "./local-connector.js";
import { SSHConnector } from "./ssh-connector.js";
import { DockerConnector } from "./docker-connector.js";
import { WebSocketConnector } from "./ws-connector.js";

export class ConnectorRegistry {
  private connectors = new Map<string, Connector>();

  async add(config: ConnectorConfig): Promise<Connector> {
    let connector: Connector;
    switch (config.type) {
      case "local":
        connector = new LocalConnector(config);
        break;
      case "ssh":
        connector = new SSHConnector(config);
        break;
      case "docker":
        connector = new DockerConnector(config);
        break;
      case "websocket":
        connector = new WebSocketConnector(config);
        break;
      default:
        throw new Error(`Unknown connector type: ${(config as { type: string }).type}`);
    }
    await connector.connect();
    this.connectors.set(connector.nodeId, connector);
    return connector;
  }

  async remove(nodeId: string): Promise<boolean> {
    const connector = this.connectors.get(nodeId);
    if (!connector) return false;
    await connector.disconnect();
    this.connectors.delete(nodeId);
    return true;
  }

  get(nodeId: string): Connector | undefined {
    return this.connectors.get(nodeId);
  }

  list(): NodeInfo[] {
    return [...this.connectors.values()].map((c) => c.info());
  }

  listConnected(): NodeInfo[] {
    return [...this.connectors.values()].filter((c) => c.isConnected()).map((c) => c.info());
  }

  async exec(nodeId: string, command: string, opts?: ExecOptions): Promise<ExecResult> {
    const connector = this.connectors.get(nodeId);
    if (!connector) throw new Error(`Node '${nodeId}' not found`);
    if (!connector.isConnected()) throw new Error(`Node '${nodeId}' is not connected`);
    return connector.exec(command, opts);
  }

  async invoke(nodeId: string, command: string, params?: unknown): Promise<InvokeResult> {
    const connector = this.connectors.get(nodeId);
    if (!connector) throw new Error(`Node '${nodeId}' not found`);
    if (!connector.isConnected()) throw new Error(`Node '${nodeId}' is not connected`);
    return connector.invoke(command, params);
  }

  async disconnectAll(): Promise<void> {
    const promises = [...this.connectors.values()].map((c) => c.disconnect().catch(() => {}));
    await Promise.all(promises);
    this.connectors.clear();
  }
}
