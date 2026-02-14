import path from "node:path";
import os from "node:os";
import fsp from "node:fs/promises";

const BASE_DIR = path.join(os.homedir(), ".undoable", "instructions");

export type InstructionVersion = {
  version: number;
  content: string;
  createdAt: number;
  summary?: string;
};

export type InstructionMeta = {
  agentId: string;
  currentVersion: number;
  versions: Array<{
    version: number;
    createdAt: number;
    summary?: string;
  }>;
};

/**
 * Versioned file-based store for agent instructions.
 * Layout:
 *   ~/.undoable/instructions/{agentId}/
 *     meta.json          – version index
 *     v1.md, v2.md, ...  – instruction content per version
 */
export class InstructionsStore {
  async init(): Promise<void> {
    await fsp.mkdir(BASE_DIR, { recursive: true });
  }

  private agentDir(agentId: string): string {
    return path.join(BASE_DIR, agentId);
  }

  private metaFile(agentId: string): string {
    return path.join(this.agentDir(agentId), "meta.json");
  }

  private versionFile(agentId: string, version: number): string {
    return path.join(this.agentDir(agentId), `v${version}.md`);
  }

  async getMeta(agentId: string): Promise<InstructionMeta | null> {
    try {
      const raw = await fsp.readFile(this.metaFile(agentId), "utf-8");
      return JSON.parse(raw) as InstructionMeta;
    } catch {
      return null;
    }
  }

  private async saveMeta(meta: InstructionMeta): Promise<void> {
    await fsp.mkdir(this.agentDir(meta.agentId), { recursive: true });
    await fsp.writeFile(this.metaFile(meta.agentId), JSON.stringify(meta, null, 2), "utf-8");
  }

  /**
   * Get the current (latest) instructions for an agent.
   */
  async getCurrent(agentId: string): Promise<string | null> {
    const meta = await this.getMeta(agentId);
    if (!meta || meta.currentVersion === 0) return null;
    return this.getVersion(agentId, meta.currentVersion);
  }

  /**
   * Get a specific version's content.
   */
  async getVersion(agentId: string, version: number): Promise<string | null> {
    try {
      return await fsp.readFile(this.versionFile(agentId, version), "utf-8");
    } catch {
      return null;
    }
  }

  /**
   * Save new instructions, creating a new version.
   * Returns the new version number.
   */
  async save(agentId: string, content: string, summary?: string): Promise<number> {
    let meta = await this.getMeta(agentId);
    if (!meta) {
      meta = { agentId, currentVersion: 0, versions: [] };
    }

    // Skip if content hasn't changed
    if (meta.currentVersion > 0) {
      const current = await this.getVersion(agentId, meta.currentVersion);
      if (current === content) return meta.currentVersion;
    }

    const newVersion = meta.currentVersion + 1;
    const now = Date.now();

    await fsp.mkdir(this.agentDir(agentId), { recursive: true });
    await fsp.writeFile(this.versionFile(agentId, newVersion), content, "utf-8");

    meta.currentVersion = newVersion;
    meta.versions.push({ version: newVersion, createdAt: now, summary });
    await this.saveMeta(meta);

    return newVersion;
  }

  /**
   * Revert to a specific previous version (creates a new version with that content).
   */
  async revert(agentId: string, targetVersion: number): Promise<number | null> {
    const content = await this.getVersion(agentId, targetVersion);
    if (content === null) return null;
    return this.save(agentId, content, `Reverted to v${targetVersion}`);
  }

  /**
   * List all versions for an agent.
   */
  async listVersions(agentId: string): Promise<InstructionMeta["versions"]> {
    const meta = await this.getMeta(agentId);
    return meta?.versions ?? [];
  }

  /**
   * Delete all instructions for an agent.
   */
  async deleteAll(agentId: string): Promise<void> {
    try {
      await fsp.rm(this.agentDir(agentId), { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}
