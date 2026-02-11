import { nowISO } from "@undoable/shared";

export type AuditEntry = {
  id: number;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ts: string;
};

export class AuditService {
  private entries: AuditEntry[] = [];
  private nextId = 1;

  log(params: {
    userId: string | null;
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }): AuditEntry {
    const entry: AuditEntry = {
      id: this.nextId++,
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      metadata: params.metadata ?? null,
      ts: nowISO(),
    };
    this.entries.push(entry);
    return entry;
  }

  list(filters?: { userId?: string; action?: string; resourceType?: string }): AuditEntry[] {
    if (!filters) return [...this.entries];
    return this.entries.filter((e) => {
      if (filters.userId && e.userId !== filters.userId) return false;
      if (filters.action && e.action !== filters.action) return false;
      if (filters.resourceType && e.resourceType !== filters.resourceType) return false;
      return true;
    });
  }

  count(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
    this.nextId = 1;
  }
}
