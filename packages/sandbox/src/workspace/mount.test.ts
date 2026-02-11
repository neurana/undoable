import { describe, it, expect } from "vitest";
import { createWorkspaceMount, createReadOnlyMount } from "./mount.js";

describe("createWorkspaceMount", () => {
  it("creates a writable mount with default container path", () => {
    const mount = createWorkspaceMount("/home/user/project");
    expect(mount.source).toBe("/home/user/project");
    expect(mount.target).toBe("/workspace");
    expect(mount.readOnly).toBe(false);
  });

  it("accepts custom container path", () => {
    const mount = createWorkspaceMount("/home/user/project", "/app");
    expect(mount.target).toBe("/app");
  });
});

describe("createReadOnlyMount", () => {
  it("creates a read-only mount", () => {
    const mount = createReadOnlyMount("/etc/config", "/config");
    expect(mount.source).toBe("/etc/config");
    expect(mount.target).toBe("/config");
    expect(mount.readOnly).toBe(true);
  });
});
