import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export type UndoStrategy = "patch" | "git-reset" | "file-restore";

export type UndoResult = {
  success: boolean;
  strategy: UndoStrategy;
  error?: string;
};

export type FileBackup = {
  path: string;
  content: string | null;
  contentBase64?: string | null;
  existed: boolean;
};

export class UndoEngine {
  async undoWithPatch(workingDir: string, patch: string): Promise<UndoResult> {
    return new Promise((resolve) => {
      const proc = execFile(
        "patch",
        ["-R", "-p1", "--no-backup-if-mismatch"],
        { cwd: workingDir, maxBuffer: 10 * 1024 * 1024 },
        (error, _stdout, stderr) => {
          if (error) {
            resolve({ success: false, strategy: "patch", error: stderr || error.message });
            return;
          }
          resolve({ success: true, strategy: "patch" });
        },
      );
      proc.stdin?.write(patch);
      proc.stdin?.end();
    });
  }

  async undoWithGitReset(workingDir: string, commitRef: string): Promise<UndoResult> {
    return new Promise((resolve) => {
      execFile("git", ["reset", "--hard", commitRef], { cwd: workingDir }, (error, _stdout, stderr) => {
        if (error) {
          resolve({ success: false, strategy: "git-reset", error: stderr || error.message });
          return;
        }
        resolve({ success: true, strategy: "git-reset" });
      });
    });
  }

  async undoWithFileRestore(backups: FileBackup[]): Promise<UndoResult> {
    try {
      for (const backup of backups) {
        if (!backup.existed) {
          try {
            await fs.unlink(backup.path);
          } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code !== "ENOENT") {
              throw err;
            }
          }
        } else if (backup.contentBase64 !== undefined) {
          await fs.mkdir(path.dirname(backup.path), { recursive: true });
          await fs.writeFile(
            backup.path,
            Buffer.from(backup.contentBase64 ?? "", "base64"),
          );
        } else if (backup.content !== null) {
          await fs.mkdir(path.dirname(backup.path), { recursive: true });
          await fs.writeFile(backup.path, backup.content, "utf-8");
        }
      }
      return { success: true, strategy: "file-restore" };
    } catch (err) {
      return {
        success: false,
        strategy: "file-restore",
        error: (err as Error).message,
      };
    }
  }

  async backupFile(filePath: string): Promise<FileBackup> {
    try {
      const buffer = await fs.readFile(filePath);
      return {
        path: filePath,
        content: buffer.toString("utf-8"),
        contentBase64: buffer.toString("base64"),
        existed: true,
      };
    } catch {
      return { path: filePath, content: null, contentBase64: null, existed: false };
    }
  }

  async backupFiles(filePaths: string[]): Promise<FileBackup[]> {
    return Promise.all(filePaths.map((p) => this.backupFile(p)));
  }
}
