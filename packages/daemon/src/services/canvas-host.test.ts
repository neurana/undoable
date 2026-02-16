import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { CANVAS_HOST_PATH, CANVAS_WS_PATH, createCanvasHostHandler } from "./canvas-host.js";

function mockReq(url: string, method: string = "GET"): IncomingMessage {
  return {
    url,
    method,
  } as IncomingMessage;
}

function mockRes() {
  const headers = new Map<string, string>();
  let body = "";

  const res = {
    statusCode: 200,
    setHeader: (name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
    },
    end: (chunk?: unknown) => {
      if (typeof chunk === "string") body += chunk;
      else if (Buffer.isBuffer(chunk)) body += chunk.toString("utf8");
      else if (chunk !== undefined && chunk !== null) body += String(chunk);
    },
  } as unknown as ServerResponse;

  return {
    res,
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    getBody: () => body,
  };
}

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function makeTempRoot() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "undoable-canvas-host-"));
  tempRoots.push(dir);
  return dir;
}

describe("canvas host", () => {
  it("serves index content from canvas host base path", async () => {
    const root = await makeTempRoot();
    const handler = await createCanvasHostHandler({
      rootDir: root,
      basePath: CANVAS_HOST_PATH,
      allowInTests: true,
      liveReload: false,
    });

    const { res, getHeader, getBody } = mockRes();
    const handled = await handler.handleHttpRequest(mockReq(CANVAS_HOST_PATH), res);

    expect(handled).toBe(true);
    expect(getHeader("content-type")).toContain("text/html");
    expect(getBody()).toContain("Undoable Canvas Host");

    await handler.close();
  });

  it("returns false for requests outside canvas host base path", async () => {
    const root = await makeTempRoot();
    const handler = await createCanvasHostHandler({
      rootDir: root,
      basePath: CANVAS_HOST_PATH,
      allowInTests: true,
      liveReload: false,
    });

    const { res } = mockRes();
    const handled = await handler.handleHttpRequest(mockReq("/not-canvas"), res);

    expect(handled).toBe(false);

    await handler.close();
  });

  it("rejects traversal-like paths outside canvas base", async () => {
    const root = await makeTempRoot();
    const handler = await createCanvasHostHandler({
      rootDir: root,
      basePath: CANVAS_HOST_PATH,
      allowInTests: true,
      liveReload: false,
    });

    const { res, getBody } = mockRes();
    const handled = await handler.handleHttpRequest(
      mockReq(`${CANVAS_HOST_PATH}/../secrets.txt`),
      res,
    );

    expect(handled).toBe(false);
    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    expect(getBody()).toBe("");

    await handler.close();
  });

  it("does not accept websocket upgrades when live reload is disabled", async () => {
    const root = await makeTempRoot();
    const handler = await createCanvasHostHandler({
      rootDir: root,
      basePath: CANVAS_HOST_PATH,
      allowInTests: true,
      liveReload: false,
    });

    const upgraded = handler.handleUpgrade(
      mockReq(CANVAS_WS_PATH),
      {} as import("node:stream").Duplex,
      Buffer.alloc(0),
    );

    expect(upgraded).toBe(false);

    await handler.close();
  });
});
