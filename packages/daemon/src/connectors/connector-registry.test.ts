import { describe, it, expect, beforeEach } from "vitest";
import { ConnectorRegistry } from "./connector-registry.js";

describe("ConnectorRegistry", () => {
  let registry: ConnectorRegistry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  it("adds a local connector and lists it", async () => {
    await registry.add({ type: "local" });
    const nodes = registry.list();
    expect(nodes.length).toBe(1);
    expect(nodes[0]!.connectorType).toBe("local");
    expect(nodes[0]!.connected).toBe(true);
  });

  it("removes a connector", async () => {
    const connector = await registry.add({ type: "local" });
    expect(registry.list().length).toBe(1);
    const removed = await registry.remove(connector.nodeId);
    expect(removed).toBe(true);
    expect(registry.list().length).toBe(0);
  });

  it("returns false when removing unknown node", async () => {
    const removed = await registry.remove("nonexistent");
    expect(removed).toBe(false);
  });

  it("gets a connector by nodeId", async () => {
    const connector = await registry.add({ type: "local" });
    const found = registry.get(connector.nodeId);
    expect(found).toBeDefined();
    expect(found!.nodeId).toBe(connector.nodeId);
  });

  it("executes a command on a local connector", async () => {
    const connector = await registry.add({ type: "local" });
    const result = await registry.exec(connector.nodeId, "echo hello");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
  });

  it("throws on exec for unknown node", async () => {
    await expect(registry.exec("nonexistent", "echo hi")).rejects.toThrow("not found");
  });

  it("invokes system.info on a local connector", async () => {
    const connector = await registry.add({ type: "local" });
    const result = await registry.invoke(connector.nodeId, "system.info");
    expect(result.ok).toBe(true);
    expect(result.payload).toBeDefined();
    const payload = result.payload as Record<string, unknown>;
    expect(payload.hostname).toBeDefined();
    expect(payload.platform).toBeDefined();
  });

  it("invokes system.run on a local connector", async () => {
    const connector = await registry.add({ type: "local" });
    const result = await registry.invoke(connector.nodeId, "system.run", {
      command: "echo test123",
    });
    expect(result.ok).toBe(true);
    const payload = result.payload as Record<string, unknown>;
    expect((payload.stdout as string).trim()).toBe("test123");
  });

  it("returns error for unsupported invoke command", async () => {
    const connector = await registry.add({ type: "local" });
    const result = await registry.invoke(connector.nodeId, "unknown.command");
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("UNSUPPORTED");
  });

  it("listConnected filters disconnected nodes", async () => {
    const connector = await registry.add({ type: "local" });
    expect(registry.listConnected().length).toBe(1);
    await connector.disconnect();
    expect(registry.listConnected().length).toBe(0);
    expect(registry.list().length).toBe(1);
  });

  it("disconnectAll clears everything", async () => {
    await registry.add({ type: "local" });
    expect(registry.list().length).toBe(1);
    await registry.disconnectAll();
    expect(registry.list().length).toBe(0);
  });
});
