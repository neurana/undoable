import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileRoutes } from "./files.js";

let app: ReturnType<typeof Fastify>;
let tempDir = "";
let previousAllowedRoots: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-files-route-"));
  previousAllowedRoots = process.env.UNDOABLE_DOWNLOAD_ALLOWED_ROOTS;
  process.env.UNDOABLE_DOWNLOAD_ALLOWED_ROOTS = tempDir;
  app = Fastify();
  fileRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
  if (previousAllowedRoots === undefined) {
    delete process.env.UNDOABLE_DOWNLOAD_ALLOWED_ROOTS;
  } else {
    process.env.UNDOABLE_DOWNLOAD_ALLOWED_ROOTS = previousAllowedRoots;
  }
});

describe("files routes", () => {
  it("downloads a file as attachment", async () => {
    const filePath = path.join(tempDir, "hello.txt");
    const content = "hello from undoable";
    await fs.writeFile(filePath, content, "utf-8");

    const res = await app.inject({
      method: "GET",
      url: `/files/download?path=${encodeURIComponent(filePath)}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toContain(
      'attachment; filename="hello.txt"',
    );
    expect(res.body).toBe(content);
  });

  it("rejects missing path on download", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/files/download",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/path is required/i);
  });

  it("returns 404 when file does not exist", async () => {
    const filePath = path.join(tempDir, "missing.txt");

    const res = await app.inject({
      method: "GET",
      url: `/files/download?path=${encodeURIComponent(filePath)}`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/file not found/i);
  });

  it("rejects directory path on download", async () => {
    const dirPath = path.join(tempDir, "folder");
    await fs.mkdir(dirPath);

    const res = await app.inject({
      method: "GET",
      url: `/files/download?path=${encodeURIComponent(dirPath)}`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/must reference a file/i);
  });

  it("rejects files outside allowed roots", async () => {
    const outsidePath = path.join(
      os.tmpdir(),
      `undoable-outside-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
    );
    await fs.writeFile(outsidePath, "outside", "utf-8");

    const res = await app.inject({
      method: "GET",
      url: `/files/download?path=${encodeURIComponent(outsidePath)}`,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/outside allowed download roots/i);

    await fs.rm(outsidePath, { force: true });
  });
});
