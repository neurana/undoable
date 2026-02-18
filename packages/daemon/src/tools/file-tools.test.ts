import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createWriteFileTool } from "./file-tools.js";

describe("createWriteFileTool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-file-tool-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes a valid PDF when path extension is .pdf", async () => {
    const writeTool = createWriteFileTool();
    const filePath = path.join(tmpDir, "mini_python_training.pdf");

    const result = await writeTool.execute({
      path: filePath,
      content: "Mini Python Training\n- Variables\n- Loops\n- Functions",
    });

    expect((result as { written?: boolean }).written).toBe(true);
    const bytes = await fs.readFile(filePath);
    expect(bytes.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });
});
