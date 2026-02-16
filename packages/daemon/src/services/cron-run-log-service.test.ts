import { describe, it, expect } from "vitest";
import { CronRunLogService } from "./cron-run-log-service.js";

describe("CronRunLogService", () => {
  it("stores finished events and filters by job", () => {
    const service = new CronRunLogService();

    service.append({ jobId: "job-1", action: "started", runAtMs: 1 });
    service.append({ jobId: "job-1", action: "finished", runAtMs: 2, status: "ok" });
    service.append({ jobId: "job-2", action: "finished", runAtMs: 3, status: "error", error: "boom" });

    const entries = service.list("job-1");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.jobId).toBe("job-1");
    expect(entries[0]?.status).toBe("ok");
  });

  it("returns newest first and respects limit", () => {
    const service = new CronRunLogService();

    service.append({ jobId: "job-1", action: "finished", runAtMs: 10, status: "ok" });
    service.append({ jobId: "job-1", action: "finished", runAtMs: 11, status: "error", error: "e" });

    const latest = service.list("job-1", 1);
    expect(latest).toHaveLength(1);
    expect(latest[0]?.runAtMs).toBe(11);
    expect(latest[0]?.status).toBe("error");
  });
});
