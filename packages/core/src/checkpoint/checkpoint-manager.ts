import * as fs from "node:fs/promises";
import * as path from "node:path";
import { nowISO } from "@undoable/shared";
import type { CheckpointData } from "./types.js";

export class CheckpointManager {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.join(baseDir, ".undoable", "checkpoints");
  }

  async save(data: CheckpointData): Promise<string> {
    const filePath = this.filePath(data.runId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const payload: CheckpointData = { ...data, savedAt: nowISO() };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
    return filePath;
  }

  async load(runId: string): Promise<CheckpointData | null> {
    const filePath = this.filePath(runId);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as CheckpointData;
    } catch {
      return null;
    }
  }

  async exists(runId: string): Promise<boolean> {
    try {
      await fs.access(this.filePath(runId));
      return true;
    } catch {
      return false;
    }
  }

  async remove(runId: string): Promise<void> {
    try {
      await fs.unlink(this.filePath(runId));
    } catch {
      // ignore if not found
    }
  }

  private filePath(runId: string): string {
    return path.join(this.baseDir, `${runId}.json`);
  }
}
