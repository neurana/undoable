import { describe, it, expect, beforeEach } from "vitest";
import { ApprovalGate } from "./approval-gate.js";

describe("ApprovalGate", () => {
  let gate: ApprovalGate;

  beforeEach(() => {
    gate = new ApprovalGate("off");
  });

  it("auto-approves when mode is off", async () => {
    const status = await gate.check("write_file", { path: "/tmp/a.txt" });
    expect(status).toBe("auto-approved");
  });

  it("auto-approves read tools when mode is mutate", async () => {
    gate.setMode("mutate");
    const status = await gate.check("read_file", { path: "/tmp/a.txt" });
    expect(status).toBe("auto-approved");
  });

  it("blocks mutate tools when mode is mutate", async () => {
    gate.setMode("mutate");
    const checkPromise = gate.check("write_file", { path: "/tmp/a.txt" });

    const pending = gate.listPending();
    expect(pending.length).toBe(1);
    expect(pending[0]!.toolName).toBe("write_file");

    gate.resolve(pending[0]!.id, true);
    const status = await checkPromise;
    expect(status).toBe("approved");
  });

  it("rejects when resolved with false", async () => {
    gate.setMode("mutate");
    const checkPromise = gate.check("edit_file", { path: "/tmp/b.txt" });

    const pending = gate.listPending();
    gate.resolve(pending[0]!.id, false);
    const status = await checkPromise;
    expect(status).toBe("rejected");
  });

  it("blocks all tools when mode is always", async () => {
    gate.setMode("always");
    const checkPromise = gate.check("read_file", { path: "/tmp/a.txt" });

    const pending = gate.listPending();
    expect(pending.length).toBe(1);
    gate.resolve(pending[0]!.id, true);
    const status = await checkPromise;
    expect(status).toBe("approved");
  });

  it("blocks exec tools when mode is mutate", async () => {
    gate.setMode("mutate");
    const checkPromise = gate.check("exec", { command: "rm -rf /" });

    const pending = gate.listPending();
    expect(pending.length).toBe(1);
    gate.resolve(pending[0]!.id, true);
    const status = await checkPromise;
    expect(status).toBe("approved");
  });

  it("auto-approves when tool matches auto-approve pattern", async () => {
    gate.setMode("mutate");
    gate.addAutoApprovePattern("write_file");
    const status = await gate.check("write_file", { path: "/tmp/a.txt" });
    expect(status).toBe("auto-approved");
  });

  it("auto-approves when path matches auto-approve pattern", async () => {
    gate.setMode("mutate");
    gate.addAutoApprovePattern("path:/tmp/");
    const status = await gate.check("write_file", { path: "/tmp/safe.txt" });
    expect(status).toBe("auto-approved");
  });

  it("auto-approves when cmd matches auto-approve pattern", async () => {
    gate.setMode("mutate");
    gate.addAutoApprovePattern("cmd:npm test");
    const status = await gate.check("exec", { command: "npm test --coverage" });
    expect(status).toBe("auto-approved");
  });

  it("removes auto-approve pattern", () => {
    gate.addAutoApprovePattern("write_file");
    expect(gate.listAutoApprovePatterns()).toContain("write_file");
    gate.removeAutoApprovePattern("write_file");
    expect(gate.listAutoApprovePatterns()).not.toContain("write_file");
  });

  it("getMode and setMode", () => {
    expect(gate.getMode()).toBe("off");
    gate.setMode("always");
    expect(gate.getMode()).toBe("always");
  });

  it("onPending callback fires", async () => {
    gate.setMode("mutate");
    let called = false;
    gate.onPending(() => { called = true; });
    const p = gate.check("write_file", { path: "/tmp/a.txt" });
    expect(called).toBe(true);
    const pending = gate.listPending();
    gate.resolve(pending[0]!.id, true);
    await p;
  });

  it("returns false when resolving unknown id", () => {
    expect(gate.resolve("nonexistent", true)).toBe(false);
  });

  it("clearResolved removes non-pending entries", async () => {
    gate.setMode("mutate");
    const p = gate.check("write_file", { path: "/tmp/a.txt" });
    const pending = gate.listPending();
    gate.resolve(pending[0]!.id, true);
    await p;
    gate.clearResolved();
    expect(gate.listPending().length).toBe(0);
  });
});
