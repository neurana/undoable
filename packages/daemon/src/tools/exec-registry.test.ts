import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addSession,
  getFinishedSession,
  getSession,
  listFinishedSessions,
  listRunningSessions,
  markExited,
  recoverExecRegistryState,
  type ProcessSession,
  MAX_OUTPUT_CHARS,
} from "./exec-registry.js";

const WAIT_PERSIST_MS = 350;

describe("exec registry durability", () => {
  const originalStateFile = process.env.UNDOABLE_EXEC_STATE_FILE;
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }

    if (originalStateFile === undefined) {
      delete process.env.UNDOABLE_EXEC_STATE_FILE;
    } else {
      process.env.UNDOABLE_EXEC_STATE_FILE = originalStateFile;
    }

    recoverExecRegistryState();
  });

  it("recovers persisted running and finished sessions after restart", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-exec-registry-"));
    tempDirs.push(tempDir);
    const stateFile = path.join(tempDir, "exec-sessions.json");
    process.env.UNDOABLE_EXEC_STATE_FILE = stateFile;

    recoverExecRegistryState();

    const running: ProcessSession = {
      id: "running-1",
      command: "sleep 60",
      pid: process.pid,
      startedAt: Date.now() - 1_000,
      cwd: tempDir,
      isPty: false,
      aggregated: "",
      tail: "",
      totalOutputChars: 0,
      maxOutputChars: MAX_OUTPUT_CHARS,
      exited: false,
      exitCode: undefined,
      exitSignal: undefined,
      backgrounded: true,
      truncated: false,
    };

    const finished: ProcessSession = {
      id: "finished-1",
      command: "echo done",
      pid: process.pid,
      startedAt: Date.now() - 500,
      cwd: tempDir,
      isPty: false,
      aggregated: "done",
      tail: "done",
      totalOutputChars: 4,
      maxOutputChars: MAX_OUTPUT_CHARS,
      exited: false,
      exitCode: undefined,
      exitSignal: undefined,
      backgrounded: false,
      truncated: false,
    };

    addSession(running);
    addSession(finished);
    markExited(finished, 0, null);

    await new Promise((resolve) => setTimeout(resolve, WAIT_PERSIST_MS));

    const recovery = recoverExecRegistryState();

    expect(recovery.runningRecovered).toBe(1);
    expect(recovery.finishedRecovered).toBe(1);
    expect(getSession("running-1")?.recovered).toBe(true);
    expect(getFinishedSession("finished-1")?.status).toBe("completed");
  });

  it("converts stale running sessions into failed finished sessions during recovery", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-exec-stale-"));
    tempDirs.push(tempDir);
    const stateFile = path.join(tempDir, "exec-sessions.json");
    process.env.UNDOABLE_EXEC_STATE_FILE = stateFile;

    const staleState = {
      version: 1,
      running: [
        {
          id: "stale-1",
          command: "long-task",
          pid: 999999,
          startedAt: Date.now() - 5_000,
          cwd: tempDir,
          isPty: false,
          aggregated: "",
          tail: "",
          totalOutputChars: 0,
          maxOutputChars: MAX_OUTPUT_CHARS,
          backgrounded: true,
          truncated: false,
        },
      ],
      finished: [],
      savedAtMs: Date.now(),
    };

    await fs.writeFile(stateFile, `${JSON.stringify(staleState, null, 2)}\n`, "utf-8");

    const recovery = recoverExecRegistryState();

    expect(recovery.runningRecovered).toBe(0);
    expect(recovery.staleRunningDropped).toBe(1);
    expect(listRunningSessions()).toHaveLength(0);
    const failed = listFinishedSessions().find((s) => s.id === "stale-1");
    expect(failed?.status).toBe("failed");
  });
});
