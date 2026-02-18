import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { SchedulerService } from "./scheduler-service.js";
import type { SchedulerEvent, ScheduledJob } from "./types.js";

async function setup(overrides?: {
  enabled?: boolean;
  storePath?: string;
  executor?: (job: ScheduledJob) => Promise<{ status: "ok" | "error" | "skipped"; error?: string }>;
  onEvent?: (evt: SchedulerEvent) => void;
  nowMs?: () => number;
}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "scheduler-svc-"));
  const sp = overrides?.storePath ?? path.join(dir, "jobs.json");
  const svc = new SchedulerService({
    config: { enabled: overrides?.enabled ?? false, storePath: sp },
    executor: overrides?.executor ?? (async () => ({ status: "ok" as const })),
    nowMs: overrides?.nowMs,
    onEvent: overrides?.onEvent,
  });
  const cleanup = async () => {
    svc.stop();
    await fs.rm(dir, { recursive: true, force: true });
  };
  return { svc, storePath: sp, dir, cleanup };
}

describe("SchedulerService", () => {
  describe("lifecycle", () => {
    it("starts and stops without error", async () => {
      const { svc, cleanup } = await setup();
      await svc.start();
      await cleanup();
    });

    it("reports status", async () => {
      const { svc, storePath, cleanup } = await setup();
      await svc.start();
      const status = await svc.status();
      expect(status.enabled).toBe(false);
      expect(status.storePath).toBe(storePath);
      expect(status.jobCount).toBe(0);
      expect(status.nextWakeAtMs).toBeNull();
      await cleanup();
    });
  });

  describe("CRUD", () => {
    it("adds a job and lists it", async () => {
      const { svc, cleanup } = await setup();
      await svc.start();

      const job = await svc.add({
        name: "test job",
        enabled: true,
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { kind: "event", text: "ping" },
      });

      expect(job.id).toBeTruthy();
      expect(job.name).toBe("test job");

      const jobs = await svc.list();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.id).toBe(job.id);
      await cleanup();
    });

    it("updates a job", async () => {
      const { svc, cleanup } = await setup();
      await svc.start();

      const job = await svc.add({
        name: "original",
        enabled: true,
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { kind: "event", text: "ping" },
      });

      const updated = await svc.update(job.id, { name: "renamed" });
      expect(updated.name).toBe("renamed");
      expect(updated.id).toBe(job.id);
      await cleanup();
    });

    it("removes a job", async () => {
      const { svc, cleanup } = await setup();
      await svc.start();

      const job = await svc.add({
        name: "to remove",
        enabled: true,
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { kind: "event", text: "ping" },
      });

      const removed = await svc.remove(job.id);
      expect(removed).toBe(true);

      const jobs = await svc.list();
      expect(jobs).toHaveLength(0);
      await cleanup();
    });

    it("remove returns false for unknown id", async () => {
      const { svc, cleanup } = await setup();
      await svc.start();
      const removed = await svc.remove("nonexistent");
      expect(removed).toBe(false);
      await cleanup();
    });

    it("update throws for unknown id", async () => {
      const { svc, cleanup } = await setup();
      await svc.start();
      await expect(svc.update("nonexistent", { name: "x" })).rejects.toThrow("unknown job id");
      await cleanup();
    });

    it("list excludes disabled jobs by default", async () => {
      const { svc, cleanup } = await setup();
      await svc.start();

      await svc.add({
        name: "enabled",
        enabled: true,
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { kind: "event", text: "a" },
      });
      const disabledJob = await svc.add({
        name: "disabled",
        enabled: false,
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { kind: "event", text: "b" },
      });

      const defaultList = await svc.list();
      expect(defaultList).toHaveLength(1);

      const allList = await svc.list({ includeDisabled: true });
      expect(allList).toHaveLength(2);
      expect(allList.some((j: ScheduledJob) => j.id === disabledJob.id)).toBe(true);
      await cleanup();
    });
  });

  describe("events", () => {
    it("emits added event on add", async () => {
      const events: SchedulerEvent[] = [];
      const { svc, cleanup } = await setup({ onEvent: (e) => events.push(e) });
      await svc.start();

      const job = await svc.add({
        name: "evented",
        enabled: true,
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { kind: "event", text: "ping" },
      });

      expect(events.some((e) => e.action === "added" && e.jobId === job.id)).toBe(true);
      await cleanup();
    });

    it("emits removed event on remove", async () => {
      const events: SchedulerEvent[] = [];
      const { svc, cleanup } = await setup({ onEvent: (e) => events.push(e) });
      await svc.start();

      const job = await svc.add({
        name: "to-remove",
        enabled: true,
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { kind: "event", text: "ping" },
      });

      await svc.remove(job.id);
      expect(events.some((e) => e.action === "removed" && e.jobId === job.id)).toBe(true);
      await cleanup();
    });
  });

  describe("execution", () => {
    it("runs a job manually with force mode", async () => {
      const executed: string[] = [];
      const { svc, cleanup } = await setup({
        executor: async (job) => {
          executed.push(job.id);
          return { status: "ok" };
        },
      });
      await svc.start();

      const job = await svc.add({
        name: "manual",
        enabled: true,
        schedule: { kind: "every", everyMs: 999_999_999 },
        payload: { kind: "run", instruction: "do stuff" },
      });

      const ran = await svc.run(job.id, "force");
      expect(ran).toBe(true);
      expect(executed).toContain(job.id);
      await cleanup();
    });

    it("run throws for unknown id", async () => {
      const { svc, cleanup } = await setup();
      await svc.start();
      await expect(svc.run("nonexistent")).rejects.toThrow("unknown job id");
      await cleanup();
    });

    it("run in due mode skips non-due jobs", async () => {
      const executed: string[] = [];
      const { svc, cleanup } = await setup({
        executor: async (job) => {
          executed.push(job.id);
          return { status: "ok" };
        },
      });
      await svc.start();

      const job = await svc.add({
        name: "future",
        enabled: true,
        schedule: { kind: "every", everyMs: 999_999_999 },
        payload: { kind: "event", text: "tick" },
      });

      const ran = await svc.run(job.id, "due");
      expect(ran).toBe(false);
      expect(executed).toHaveLength(0);
      await cleanup();
    });

    it("executes due jobs in parallel on timer ticks", async () => {
      const starts = new Map<string, number>();
      const { svc, cleanup } = await setup({
        enabled: true,
        executor: async (job) => {
          starts.set(job.id, Date.now());
          await new Promise((resolve) => setTimeout(resolve, 140));
          return { status: "ok" as const };
        },
      });
      await svc.start();

      const at = new Date(Date.now() + 80).toISOString();
      await svc.add({
        name: "parallel-a",
        enabled: true,
        schedule: { kind: "at", at },
        payload: { kind: "event", text: "A" },
      });
      await svc.add({
        name: "parallel-b",
        enabled: true,
        schedule: { kind: "at", at },
        payload: { kind: "event", text: "B" },
      });

      await new Promise((resolve) => setTimeout(resolve, 600));

      const observed = [...starts.values()];
      expect(observed).toHaveLength(2);
      const deltaMs = Math.abs(observed[0]! - observed[1]!);
      expect(deltaMs).toBeLessThan(100);
      await cleanup();
    });
  });

  describe("persistence", () => {
    it("persists jobs to disk and reloads", async () => {
      const { svc: svc1, storePath, cleanup: cleanup1 } = await setup();
      await svc1.start();
      await svc1.add({
        name: "persistent",
        enabled: true,
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { kind: "event", text: "saved" },
      });
      svc1.stop();

      const { svc: svc2, cleanup: cleanup2 } = await setup({ storePath });
      await svc2.start();
      const jobs = await svc2.list();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.name).toBe("persistent");
      await cleanup2();
      await cleanup1();
    });
  });

  describe("at schedule auto-delete", () => {
    it("deletes one-shot job after successful execution", async () => {
      const events: SchedulerEvent[] = [];
      let clock = 1000;
      const { svc, cleanup } = await setup({
        nowMs: () => clock,
        executor: async () => ({ status: "ok" }),
        onEvent: (e) => events.push(e),
      });
      await svc.start();

      const futureAt = new Date(2000).toISOString();
      const job = await svc.add({
        name: "one-shot",
        enabled: true,
        schedule: { kind: "at", at: futureAt },
        payload: { kind: "event", text: "fire" },
      });

      clock = 3000;
      await svc.run(job.id, "force");

      expect(events.some((e) => e.action === "removed" && e.jobId === job.id)).toBe(true);
      const jobs = await svc.list({ includeDisabled: true });
      expect(jobs.find((j: ScheduledJob) => j.id === job.id)).toBeUndefined();
      await cleanup();
    });
  });
});
