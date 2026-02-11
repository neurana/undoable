import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { nowISO } from "@undoable/shared";
import type { ShadowWorkspaceConfig, ShadowWorkspaceInfo } from "./types.js";

const DEFAULT_EXCLUDE = ["node_modules", ".git", ".undoable", "dist", "coverage"];

export class ShadowWorkspaceManager {
  async create(config: ShadowWorkspaceConfig): Promise<ShadowWorkspaceInfo> {
    const workspacePath = path.join(
      config.baseDir,
      ".undoable",
      "shadow",
      config.runId,
      "workspace",
    );

    await fs.mkdir(workspacePath, { recursive: true });

    if (config.strategy === "copy") {
      await this.copyDirectory(config.sourceDir, workspacePath, config.exclude ?? DEFAULT_EXCLUDE);
    }

    return {
      runId: config.runId,
      workspacePath,
      strategy: config.strategy,
      createdAt: nowISO(),
    };
  }

  async destroy(workspacePath: string): Promise<void> {
    await fs.rm(workspacePath, { recursive: true, force: true });
  }

  async exists(workspacePath: string): Promise<boolean> {
    try {
      await fs.access(workspacePath);
      return true;
    } catch {
      return false;
    }
  }

  async diff(workspacePath: string, sourceDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        "diff",
        ["-ruN", "--exclude=.git", sourceDir, workspacePath],
        { maxBuffer: 10 * 1024 * 1024 },
        (error, stdout) => {
          if (error && error.code !== 1) {
            reject(new Error(`diff failed: ${error.message}`));
            return;
          }
          resolve(stdout);
        },
      );
    });
  }

  private async copyDirectory(src: string, dest: string, exclude: string[]): Promise<void> {
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyDirectory(srcPath, destPath, exclude);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}
