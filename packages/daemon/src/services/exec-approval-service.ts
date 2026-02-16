import { randomUUID } from "node:crypto";

export type ExecApprovalDecision = "allow-once" | "allow-always" | "deny";

export type ExecApprovalRequest = {
  command: string;
  cwd?: string | null;
  host?: string | null;
  security?: string | null;
  ask?: string | null;
  agentId?: string | null;
  resolvedPath?: string | null;
  sessionKey?: string | null;
};

export type ExecApprovalRecord = {
  id: string;
  request: ExecApprovalRequest;
  createdAtMs: number;
  expiresAtMs: number;
};

type PendingRecord = ExecApprovalRecord & {
  timer: ReturnType<typeof setTimeout>;
  resolve: (decision: ExecApprovalDecision) => void;
  promise: Promise<ExecApprovalDecision>;
};

export class ExecApprovalService {
  private pending = new Map<string, PendingRecord>();

  create(request: ExecApprovalRequest, timeoutMs = 120_000, explicitId?: string): ExecApprovalRecord {
    const id = explicitId?.trim() || randomUUID();
    if (this.pending.has(id)) {
      throw new Error("approval id already pending");
    }

    const now = Date.now();
    const expiresAtMs = now + Math.max(1_000, timeoutMs);

    let resolver: ((decision: ExecApprovalDecision) => void) | null = null;
    const promise = new Promise<ExecApprovalDecision>((resolve) => {
      resolver = resolve;
    });

    const timer = setTimeout(() => {
      const current = this.pending.get(id);
      if (!current) return;
      this.pending.delete(id);
      current.resolve("deny");
    }, Math.max(1_000, timeoutMs));

    const record: PendingRecord = {
      id,
      request,
      createdAtMs: now,
      expiresAtMs,
      timer,
      resolve: (decision: ExecApprovalDecision) => {
        if (resolver) resolver(decision);
      },
      promise,
    };

    this.pending.set(id, record);
    return {
      id: record.id,
      request: record.request,
      createdAtMs: record.createdAtMs,
      expiresAtMs: record.expiresAtMs,
    };
  }

  waitForDecision(id: string): Promise<ExecApprovalDecision> {
    const pending = this.pending.get(id);
    if (!pending) {
      throw new Error("unknown approval id");
    }
    return pending.promise;
  }

  resolve(id: string, decision: ExecApprovalDecision): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;

    this.pending.delete(id);
    clearTimeout(pending.timer);
    pending.resolve(decision);
    return true;
  }

  getSnapshot(id: string): ExecApprovalRecord | null {
    const pending = this.pending.get(id);
    if (!pending) return null;
    return {
      id: pending.id,
      request: pending.request,
      createdAtMs: pending.createdAtMs,
      expiresAtMs: pending.expiresAtMs,
    };
  }
}
