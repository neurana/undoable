export type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string };

export type JobPayload =
  | { kind: "run"; instruction: string; agentId?: string; model?: string }
  | { kind: "event"; text: string };

export type JobStatus = "ok" | "error" | "skipped";

export type JobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastRunId?: string;
  lastStatus?: JobStatus;
  lastError?: string;
  lastDurationMs?: number;
  consecutiveErrors?: number;
};

export type ScheduledJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  payload: JobPayload;
  state: JobState;
};

export type JobCreate = Omit<ScheduledJob, "id" | "createdAtMs" | "updatedAtMs" | "state"> & {
  state?: Partial<JobState>;
};

export type JobPatch = Partial<Omit<ScheduledJob, "id" | "createdAtMs" | "state">> & {
  state?: Partial<JobState>;
};

export type JobStoreFile = {
  version: 1;
  jobs: ScheduledJob[];
};

export type SchedulerEvent = {
  jobId: string;
  action: "added" | "updated" | "removed" | "started" | "finished";
  runAtMs?: number;
  durationMs?: number;
  status?: JobStatus;
  error?: string;
  nextRunAtMs?: number;
};

export type SchedulerConfig = {
  enabled: boolean;
  storePath: string;
};

export type JobExecutor = (job: ScheduledJob) => Promise<{
  status: JobStatus;
  error?: string;
  runId?: string;
}>;
