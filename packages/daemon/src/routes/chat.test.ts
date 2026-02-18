import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { SchedulerService } from "@undoable/core";
import type { ChatService } from "../services/chat-service.js";
import type { RunManager } from "../services/run-manager.js";
import type { BrowserService } from "../services/browser-service.js";
import { chatRoutes, type ChatRouteConfig } from "./chat.js";

type MockAction = {
  id: string;
  toolName: string;
  category: string;
  args: Record<string, unknown>;
  startedAt: string;
  undoable: boolean;
  error?: string;
};

const mockState = vi.hoisted(() => ({
  records: [] as MockAction[],
  undoable: [] as MockAction[],
  redoable: [] as MockAction[],
  undoAction: vi.fn(async (id: string) => ({ actionId: id, toolName: "write_file", success: true })),
  undoLastN: vi.fn(async (count: number) => Array.from({ length: count }, (_v, i) => ({
    actionId: `undo-${i + 1}`,
    toolName: "write_file",
    success: true,
  }))),
  undoAll: vi.fn(async () => [{ actionId: "undo-all", toolName: "write_file", success: true }]),
  redoAction: vi.fn(async (id: string) => ({ actionId: id, toolName: "write_file", success: true })),
  redoLastN: vi.fn(async (count: number) => Array.from({ length: count }, (_v, i) => ({
    actionId: `redo-${i + 1}`,
    toolName: "write_file",
    success: true,
  }))),
  redoAll: vi.fn(async () => [{ actionId: "redo-all", toolName: "write_file", success: true }]),
}));

vi.mock("../tools/index.js", () => ({
  createToolRegistry: () => ({
    tools: [],
    definitions: [],
    execute: async () => ({}),
    registerTools: () => { },
    actionLog: {
      list: () => [...mockState.records],
    },
    approvalGate: {
      onPending: () => { },
      getMode: () => "always",
      listPending: () => [],
      getApproval: () => null,
      resolveApproval: async () => ({ ok: true }),
      setMode: () => { },
      addAutoApprovePattern: () => { },
    },
    undoService: {
      listUndoable: () => [...mockState.undoable],
      listRedoable: () => [...mockState.redoable],
      undoAction: mockState.undoAction,
      undoLastN: mockState.undoLastN,
      undoAll: mockState.undoAll,
      redoAction: mockState.redoAction,
      redoLastN: mockState.redoLastN,
      redoAll: mockState.redoAll,
    },
  }),
}));

describe("chat routes /chat/undo", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    mockState.records = [];
    mockState.undoable = [];
    mockState.redoable = [];
    mockState.undoAction.mockClear();
    mockState.undoLastN.mockClear();
    mockState.undoAll.mockClear();
    mockState.redoAction.mockClear();
    mockState.redoLastN.mockClear();
    mockState.redoAll.mockClear();

    const config: ChatRouteConfig = {
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "https://example.invalid/v1",
    };

    chatRoutes(
      app,
      {} as ChatService,
      config,
      {} as RunManager,
      {} as SchedulerService,
      {} as BrowserService,
    );

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns undo coverage fields in list response", async () => {
    mockState.records = [
      {
        id: "a-read",
        toolName: "read_file",
        category: "read",
        args: { path: "~/notes.txt" },
        startedAt: "2026-02-18T10:00:00.000Z",
        undoable: false,
      },
      {
        id: "a-control",
        toolName: "undo",
        category: "mutate",
        args: { action: "list" },
        startedAt: "2026-02-18T10:00:30.000Z",
        undoable: false,
      },
      {
        id: "a-write",
        toolName: "write_file",
        category: "mutate",
        args: { path: "~/todo.txt" },
        startedAt: "2026-02-18T10:01:00.000Z",
        undoable: true,
      },
      {
        id: "a-exec",
        toolName: "exec",
        category: "exec",
        args: { command: "brew install mactex" },
        startedAt: "2026-02-18T10:02:00.000Z",
        undoable: false,
        error: "Blocked by Undo Guarantee mode",
      },
    ];
    const writeAction = mockState.records.find((record) => record.id === "a-write")!;
    mockState.undoable = [writeAction];
    mockState.redoable = [writeAction];

    const response = await app.inject({
      method: "POST",
      url: "/chat/undo",
      payload: { action: "list" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      recordedCount: 4,
      undoable: [
        {
          id: "a-write",
          tool: "write_file",
          args: { path: "~/todo.txt" },
          startedAt: "2026-02-18T10:01:00.000Z",
        },
      ],
      redoable: [
        {
          id: "a-write",
          tool: "write_file",
          args: { path: "~/todo.txt" },
          startedAt: "2026-02-18T10:01:00.000Z",
        },
      ],
      nonUndoableRecent: [
        {
          id: "a-read",
          tool: "read_file",
          category: "read",
          startedAt: "2026-02-18T10:00:00.000Z",
          error: null,
        },
        {
          id: "a-exec",
          tool: "exec",
          category: "exec",
          startedAt: "2026-02-18T10:02:00.000Z",
          error: "Blocked by Undo Guarantee mode",
        },
      ],
    });
  });

  it("dispatches undo and redo actions to undo service", async () => {
    const undoOne = await app.inject({
      method: "POST",
      url: "/chat/undo",
      payload: { action: "undo_one", id: "a-write" },
    });
    expect(undoOne.statusCode).toBe(200);
    expect(mockState.undoAction).toHaveBeenCalledWith("a-write");

    const undoLast = await app.inject({
      method: "POST",
      url: "/chat/undo",
      payload: { action: "undo_last", count: 2 },
    });
    expect(undoLast.statusCode).toBe(200);
    expect(mockState.undoLastN).toHaveBeenCalledWith(2);

    const redoAll = await app.inject({
      method: "POST",
      url: "/chat/undo",
      payload: { action: "redo_all" },
    });
    expect(redoAll.statusCode).toBe(200);
    expect(mockState.redoAll).toHaveBeenCalledTimes(1);
  });
});
