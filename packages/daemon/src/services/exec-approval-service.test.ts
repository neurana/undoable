import { describe, it, expect } from "vitest";
import { ExecApprovalService } from "./exec-approval-service.js";

describe("ExecApprovalService", () => {
  it("creates and resolves a pending approval", async () => {
    const service = new ExecApprovalService();

    const record = service.create({ command: "echo hello" }, 10_000, "approval-1");
    expect(record.id).toBe("approval-1");

    const wait = service.waitForDecision(record.id);
    const ok = service.resolve(record.id, "allow-once");

    expect(ok).toBe(true);
    await expect(wait).resolves.toBe("allow-once");
  });

  it("returns false when resolving unknown id", () => {
    const service = new ExecApprovalService();
    expect(service.resolve("missing", "deny")).toBe(false);
  });

  it("rejects duplicate pending id", () => {
    const service = new ExecApprovalService();
    service.create({ command: "ls" }, 10_000, "dup-id");
    expect(() => service.create({ command: "pwd" }, 10_000, "dup-id")).toThrow("approval id already pending");
  });
});
