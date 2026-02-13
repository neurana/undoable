import { describe, it, expect, beforeEach } from "vitest";
import { ActionLog } from "./action-log.js";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";

describe("ActionLog", () => {
  let log: ActionLog;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-action-log-"));
    log = new ActionLog(tmpDir);
  });

  it("records an action", async () => {
    const action = await log.record({
      toolName: "write_file",
      category: "mutate",
      args: { path: "/tmp/test.txt", content: "hello" },
      approval: "auto-approved",
      undoable: true,
    });
    expect(action.id).toBeDefined();
    expect(action.toolName).toBe("write_file");
    expect(action.category).toBe("mutate");
    expect(action.undoable).toBe(true);
    expect(action.startedAt).toBeDefined();
  });

  it("completes an action", async () => {
    const action = await log.record({
      toolName: "read_file",
      category: "read",
      args: { path: "/tmp/test.txt" },
      approval: "auto-approved",
      undoable: false,
    });
    const completed = await log.complete(action.id, { content: "hello" });
    expect(completed).not.toBeNull();
    expect(completed!.completedAt).toBeDefined();
    expect(completed!.durationMs).toBeGreaterThanOrEqual(0);
    expect(completed!.result).toEqual({ content: "hello" });
  });

  it("completes with error", async () => {
    const action = await log.record({
      toolName: "exec",
      category: "exec",
      args: { command: "false" },
      approval: "auto-approved",
      undoable: false,
    });
    const completed = await log.complete(action.id, null, "Command failed");
    expect(completed!.error).toBe("Command failed");
  });

  it("lists and filters actions", async () => {
    await log.record({ toolName: "read_file", category: "read", args: {}, approval: "auto-approved", undoable: false });
    await log.record({ toolName: "write_file", category: "mutate", args: {}, approval: "auto-approved", undoable: true });
    await log.record({ toolName: "exec", category: "exec", args: {}, approval: "auto-approved", undoable: false });

    expect(log.list().length).toBe(3);
    expect(log.list({ category: "mutate" }).length).toBe(1);
    expect(log.list({ toolName: "exec" }).length).toBe(1);
  });

  it("gets action by id", async () => {
    const action = await log.record({
      toolName: "edit_file",
      category: "mutate",
      args: {},
      approval: "approved",
      undoable: true,
    });
    const found = log.getById(action.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(action.id);
  });

  it("lists undoable actions", async () => {
    const a1 = await log.record({ toolName: "write_file", category: "mutate", args: {}, approval: "auto-approved", undoable: true, undoData: { type: "file", path: "/tmp/a.txt", previousContent: null, previousExisted: false } });
    await log.complete(a1.id, { written: true });

    const a2 = await log.record({ toolName: "read_file", category: "read", args: {}, approval: "auto-approved", undoable: false });
    await log.complete(a2.id, { content: "x" });

    expect(log.undoableActions().length).toBe(1);
    expect(log.undoableActions()[0]!.toolName).toBe("write_file");
  });

  it("sanitizes large content in args", async () => {
    const bigContent = "x".repeat(5000);
    const action = await log.record({
      toolName: "write_file",
      category: "mutate",
      args: { path: "/tmp/big.txt", content: bigContent },
      approval: "auto-approved",
      undoable: true,
    });
    expect((action.args.content as string).length).toBeLessThan(5000);
  });

  it("persists to JSONL", async () => {
    const action = await log.record({
      toolName: "write_file",
      category: "mutate",
      args: { path: "/tmp/t.txt" },
      approval: "auto-approved",
      undoable: false,
    });
    await log.complete(action.id, { ok: true });

    const files = await fs.readdir(tmpDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
    expect(jsonlFiles.length).toBe(1);

    const content = await fs.readFile(path.join(tmpDir, jsonlFiles[0]!), "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.toolName).toBe("write_file");
  });

  it("count and clear", async () => {
    await log.record({ toolName: "a", category: "read", args: {}, approval: "auto-approved", undoable: false });
    await log.record({ toolName: "b", category: "read", args: {}, approval: "auto-approved", undoable: false });
    expect(log.count()).toBe(2);
    log.clear();
    expect(log.count()).toBe(0);
  });
});
