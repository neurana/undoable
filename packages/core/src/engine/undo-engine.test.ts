import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { UndoEngine } from "./undo-engine.js";

let engine: UndoEngine;
let tmpDir: string;

beforeEach(async () => {
  engine = new UndoEngine();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-undo-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("UndoEngine", () => {
  describe("backupFile", () => {
    it("backs up existing file", async () => {
      const filePath = path.join(tmpDir, "a.txt");
      await fs.writeFile(filePath, "original");

      const backup = await engine.backupFile(filePath);
      expect(backup.existed).toBe(true);
      expect(backup.content).toBe("original");
      expect(backup.path).toBe(filePath);
    });

    it("records non-existent file", async () => {
      const backup = await engine.backupFile(path.join(tmpDir, "nope.txt"));
      expect(backup.existed).toBe(false);
      expect(backup.content).toBeNull();
    });
  });

  describe("backupFiles", () => {
    it("backs up multiple files", async () => {
      await fs.writeFile(path.join(tmpDir, "a.txt"), "aaa");
      await fs.writeFile(path.join(tmpDir, "b.txt"), "bbb");

      const backups = await engine.backupFiles([
        path.join(tmpDir, "a.txt"),
        path.join(tmpDir, "b.txt"),
        path.join(tmpDir, "c.txt"),
      ]);

      expect(backups).toHaveLength(3);
      expect(backups[0]!.existed).toBe(true);
      expect(backups[1]!.existed).toBe(true);
      expect(backups[2]!.existed).toBe(false);
    });
  });

  describe("undoWithFileRestore", () => {
    it("restores modified file to original content", async () => {
      const filePath = path.join(tmpDir, "restore.txt");
      await fs.writeFile(filePath, "original");
      const backup = await engine.backupFile(filePath);

      await fs.writeFile(filePath, "modified");

      const result = await engine.undoWithFileRestore([backup]);
      expect(result.success).toBe(true);
      expect(result.strategy).toBe("file-restore");

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("original");
    });

    it("deletes newly created file", async () => {
      const filePath = path.join(tmpDir, "new.txt");
      const backup = await engine.backupFile(filePath);

      await fs.writeFile(filePath, "created after backup");

      const result = await engine.undoWithFileRestore([backup]);
      expect(result.success).toBe(true);

      try {
        await fs.access(filePath);
        expect.fail("File should have been deleted");
      } catch {
        // expected
      }
    });

    it("handles empty backup list", async () => {
      const result = await engine.undoWithFileRestore([]);
      expect(result.success).toBe(true);
    });

    it("restores multiple files", async () => {
      const f1 = path.join(tmpDir, "f1.txt");
      const f2 = path.join(tmpDir, "f2.txt");
      await fs.writeFile(f1, "one");
      await fs.writeFile(f2, "two");

      const backups = await engine.backupFiles([f1, f2]);

      await fs.writeFile(f1, "changed1");
      await fs.writeFile(f2, "changed2");

      const result = await engine.undoWithFileRestore(backups);
      expect(result.success).toBe(true);

      expect(await fs.readFile(f1, "utf-8")).toBe("one");
      expect(await fs.readFile(f2, "utf-8")).toBe("two");
    });
  });
});
