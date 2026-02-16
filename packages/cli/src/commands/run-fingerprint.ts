import { createHash } from "node:crypto";

export type FingerprintRunRecord = {
  id: string;
  status: string;
  instruction: string;
  agentId?: string;
  jobId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function buildRunFingerprint(run: FingerprintRunRecord): string {
  const payload = JSON.stringify({
    id: run.id,
    status: run.status,
    instruction: run.instruction,
    agentId: run.agentId,
    jobId: run.jobId,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  });

  return createHash("sha256").update(payload).digest("hex");
}
