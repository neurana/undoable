import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolAdapter, ToolExecuteParams, ToolResult } from "../types.js";

type FsAction = "read" | "write" | "delete" | "move" | "mkdir" | "list" | "exists";

export class FsAdapter implements ToolAdapter {
  readonly id = "fs";
  readonly description = "Filesystem operations (read, write, delete, move, list)";
  readonly requiredCapabilityPrefix = "fs";

  async execute(params: ToolExecuteParams): Promise<ToolResult> {
    const action = params.params.action as FsAction;
    const filePath = params.params.path as string | undefined;

    if (!filePath) {
      return { success: false, output: "", error: "path is required" };
    }

    const baseDir = params.workingDir;
    const resolved = path.resolve(baseDir, filePath);

    if (!resolved.startsWith(path.resolve(baseDir))) {
      return { success: false, output: "", error: "Path traversal denied" };
    }

    switch (action) {
      case "read":
        return this.read(resolved);
      case "write":
        return this.write(resolved, params.params.content as string);
      case "delete":
        return this.remove(resolved);
      case "move":
        return this.move(resolved, path.resolve(baseDir, params.params.destination as string));
      case "mkdir":
        return this.mkdir(resolved);
      case "list":
        return this.list(resolved);
      case "exists":
        return this.exists(resolved);
      default:
        return { success: false, output: "", error: `Unknown fs action: ${action}` };
    }
  }

  validate(params: Record<string, unknown>): boolean {
    return typeof params.action === "string" && typeof params.path === "string";
  }

  estimateCapabilities(params: Record<string, unknown>): string[] {
    const action = params.action as string;
    const filePath = params.path as string;
    if (action === "read" || action === "list" || action === "exists") {
      return [`fs.read:${filePath}`];
    }
    return [`fs.write:${filePath}`];
  }

  private async read(filePath: string): Promise<ToolResult> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return { success: true, output: content };
    } catch (err) {
      return { success: false, output: "", error: `Read failed: ${(err as Error).message}` };
    }
  }

  private async write(filePath: string, content: string): Promise<ToolResult> {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      return { success: true, output: `Written ${content.length} bytes to ${filePath}` };
    } catch (err) {
      return { success: false, output: "", error: `Write failed: ${(err as Error).message}` };
    }
  }

  private async remove(filePath: string): Promise<ToolResult> {
    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        await fs.rm(filePath, { recursive: true });
      } else {
        await fs.unlink(filePath);
      }
      return { success: true, output: `Deleted ${filePath}` };
    } catch (err) {
      return { success: false, output: "", error: `Delete failed: ${(err as Error).message}` };
    }
  }

  private async move(src: string, dest: string): Promise<ToolResult> {
    try {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.rename(src, dest);
      return { success: true, output: `Moved ${src} → ${dest}` };
    } catch (err) {
      return { success: false, output: "", error: `Move failed: ${(err as Error).message}` };
    }
  }

  private async mkdir(dirPath: string): Promise<ToolResult> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return { success: true, output: `Created directory ${dirPath}` };
    } catch (err) {
      return { success: false, output: "", error: `Mkdir failed: ${(err as Error).message}` };
    }
  }

  private async list(dirPath: string): Promise<ToolResult> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const lines = entries.map((e) => `${e.isDirectory() ? "d" : "f"} ${e.name}`);
      return { success: true, output: lines.join("\n") };
    } catch (err) {
      return { success: false, output: "", error: `List failed: ${(err as Error).message}` };
    }
  }

  private async exists(filePath: string): Promise<ToolResult> {
    try {
      await fs.access(filePath);
      return { success: true, output: "true" };
    } catch {
      return { success: true, output: "false" };
    }
  }
}
