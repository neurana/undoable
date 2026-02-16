import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SandboxExecService } from "../services/sandbox-exec.js";
import { createExecTool } from "./exec-tool.js";

describe("createExecTool isolation", () => {
  const originalIsolation = process.env.UNDOABLE_EXEC_ISOLATION;

  afterEach(() => {
    if (originalIsolation === undefined) {
      delete process.env.UNDOABLE_EXEC_ISOLATION;
    } else {
      process.env.UNDOABLE_EXEC_ISOLATION = originalIsolation;
    }
    vi.restoreAllMocks();
  });

  it("blocks when sandbox is required but unavailable", async () => {
    process.env.UNDOABLE_EXEC_ISOLATION = "require";

    const ensureSandbox = vi.fn();
    const sandboxExec = {
      available: false,
      ensureSandbox,
      exec: vi.fn(),
    } as unknown as SandboxExecService;

    const tool = createExecTool({ sandboxExec, sandboxSessionId: "test" });
    const result = await tool.execute({ command: "echo hello" }) as { error?: string };

    expect(result.error).toContain("sandbox is required");
    expect(ensureSandbox).not.toHaveBeenCalled();
  });

  it("uses deterministic sandbox session id and workspace mapping", async () => {
    process.env.UNDOABLE_EXEC_ISOLATION = "prefer";

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-exec-tool-"));
    try {
      const ensureSandbox = vi.fn(async () => undefined);
      const exec = vi.fn(async () => ({
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      }));

      const sandboxExec = {
        available: true,
        ensureSandbox,
        exec,
      } as unknown as SandboxExecService;

      const tool = createExecTool({ sandboxExec, sandboxSessionId: "chat" });
      const result = await tool.execute({ command: "echo hello", cwd: tempDir }) as {
        status?: string;
        sandbox?: boolean;
      };

      const resolvedCwd = path.resolve(tempDir);
      const digest = createHash("sha256").update(resolvedCwd).digest("hex").slice(0, 12);
      const expectedSessionId = `chat:${digest}`;

      expect(ensureSandbox).toHaveBeenCalledWith(expectedSessionId, resolvedCwd);
      expect(exec).toHaveBeenCalledWith(
        expectedSessionId,
        expect.objectContaining({
          command: "echo hello",
          cwd: "/workspace",
        }),
      );
      expect(result).toMatchObject({ status: "completed", sandbox: true });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("blocks background exec in strict isolation mode", async () => {
    process.env.UNDOABLE_EXEC_ISOLATION = "require";

    const ensureSandbox = vi.fn(async () => undefined);
    const sandboxExec = {
      available: true,
      ensureSandbox,
      exec: vi.fn(async () => ({ exitCode: 0, stdout: "ok", stderr: "" })),
    } as unknown as SandboxExecService;

    const tool = createExecTool({ sandboxExec, sandboxSessionId: "strict" });
    const result = await tool.execute({ command: "echo hello", background: true }) as { error?: string };

    expect(result.error).toContain("interactive/background exec is not supported");
    expect(ensureSandbox).not.toHaveBeenCalled();
  });
});
