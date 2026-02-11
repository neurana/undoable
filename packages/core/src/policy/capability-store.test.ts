import { describe, it, expect } from "vitest";
import { CapabilityStore } from "./capability-store.js";

describe("CapabilityStore", () => {
  it("grants and checks a capability", () => {
    const store = new CapabilityStore();
    store.grant("run-1", "fs.read:*");

    expect(store.check("run-1", "fs.read:/any/path")).toBe(true);
  });

  it("denies when no grants exist", () => {
    const store = new CapabilityStore();
    expect(store.check("run-1", "fs.read:/path")).toBe(false);
  });

  it("denies when scope has no matching grant", () => {
    const store = new CapabilityStore();
    store.grant("run-1", "fs.read:*");

    expect(store.check("run-1", "fs.write:/path")).toBe(false);
  });

  it("denies for different scope key", () => {
    const store = new CapabilityStore();
    store.grant("run-1", "fs.read:*");

    expect(store.check("run-2", "fs.read:/path")).toBe(false);
  });

  it("revokes a capability", () => {
    const store = new CapabilityStore();
    store.grant("run-1", "fs.read:*");
    store.revoke("run-1", "fs.read:*");

    expect(store.check("run-1", "fs.read:/path")).toBe(false);
  });

  it("checkAll separates granted and denied", () => {
    const store = new CapabilityStore();
    store.grant("run-1", "fs.read:*");

    const result = store.checkAll("run-1", [
      "fs.read:/a",
      "fs.write:/b",
      "fs.read:/c",
    ]);

    expect(result.granted).toEqual(["fs.read:/a", "fs.read:/c"]);
    expect(result.denied).toEqual(["fs.write:/b"]);
  });

  it("checkAll returns all denied when no grants", () => {
    const store = new CapabilityStore();
    const result = store.checkAll("run-1", ["fs.read:/a", "fs.write:/b"]);

    expect(result.granted).toEqual([]);
    expect(result.denied).toEqual(["fs.read:/a", "fs.write:/b"]);
  });

  it("listGrants returns all grants for scope", () => {
    const store = new CapabilityStore();
    store.grant("run-1", "fs.read:*");
    store.grant("run-1", "shell.exec:*");

    expect(store.listGrants("run-1")).toEqual(["fs.read:*", "shell.exec:*"]);
  });

  it("listGrants returns empty for unknown scope", () => {
    const store = new CapabilityStore();
    expect(store.listGrants("run-1")).toEqual([]);
  });

  it("clear removes all grants for scope", () => {
    const store = new CapabilityStore();
    store.grant("run-1", "fs.read:*");
    store.grant("run-1", "shell.exec:*");
    store.clear("run-1");

    expect(store.listGrants("run-1")).toEqual([]);
    expect(store.check("run-1", "fs.read:/a")).toBe(false);
  });

  it("supports multiple scopes independently", () => {
    const store = new CapabilityStore();
    store.grant("run-1", "fs.read:*");
    store.grant("run-2", "shell.exec:*");

    expect(store.check("run-1", "fs.read:/a")).toBe(true);
    expect(store.check("run-1", "shell.exec:ls")).toBe(false);
    expect(store.check("run-2", "shell.exec:ls")).toBe(true);
    expect(store.check("run-2", "fs.read:/a")).toBe(false);
  });

  it("handles recursive glob grants", () => {
    const store = new CapabilityStore();
    store.grant("run-1", "fs.read:/src/**");

    expect(store.check("run-1", "fs.read:/src/a/b/c")).toBe(true);
    expect(store.check("run-1", "fs.read:/other/file")).toBe(false);
  });
});
