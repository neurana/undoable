import { generateId, nowISO } from "@undoable/shared";
import type { ApprovalMode, ApprovalStatus } from "./types.js";
import { requiresApproval } from "./types.js";

export type PendingApproval = {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  description: string;
  createdAt: string;
  status: ApprovalStatus;
  resolvedAt?: string;
  resolvedBy?: string;
};

type ApprovalResolver = {
  resolve: (approved: boolean) => void;
};

export class ApprovalGate {
  private mode: ApprovalMode;
  private pending = new Map<string, PendingApproval>();
  private resolvers = new Map<string, ApprovalResolver>();
  private autoApprovePatterns: string[] = [];
  private onPendingCallback?: (approval: PendingApproval) => void;

  constructor(mode: ApprovalMode = "off") {
    this.mode = mode;
  }

  setMode(mode: ApprovalMode): void {
    this.mode = mode;
  }

  getMode(): ApprovalMode {
    return this.mode;
  }

  addAutoApprovePattern(pattern: string): void {
    if (!this.autoApprovePatterns.includes(pattern)) {
      this.autoApprovePatterns.push(pattern);
    }
  }

  removeAutoApprovePattern(pattern: string): void {
    this.autoApprovePatterns = this.autoApprovePatterns.filter((p) => p !== pattern);
  }

  listAutoApprovePatterns(): string[] {
    return [...this.autoApprovePatterns];
  }

  onPending(callback: (approval: PendingApproval) => void): void {
    this.onPendingCallback = callback;
  }

  async check(toolName: string, args: Record<string, unknown>): Promise<ApprovalStatus> {
    if (!requiresApproval(toolName, this.mode)) {
      return "auto-approved";
    }

    if (this.isAutoApproved(toolName, args)) {
      return "auto-approved";
    }

    const approval: PendingApproval = {
      id: generateId(),
      toolName,
      args: this.summarizeArgs(args),
      description: this.describeAction(toolName, args),
      createdAt: nowISO(),
      status: "pending",
    };

    this.pending.set(approval.id, approval);
    this.onPendingCallback?.(approval);

    return new Promise<ApprovalStatus>((resolve) => {
      const timeout = setTimeout(() => {
        this.resolvers.delete(approval.id);
        approval.status = "rejected";
        approval.resolvedAt = nowISO();
        resolve("rejected");
      }, 300_000);

      this.resolvers.set(approval.id, {
        resolve: (approved: boolean) => {
          clearTimeout(timeout);
          this.resolvers.delete(approval.id);
          approval.status = approved ? "approved" : "rejected";
          approval.resolvedAt = nowISO();
          resolve(approval.status);
        },
      });
    });
  }

  resolve(approvalId: string, approved: boolean, resolvedBy?: string): boolean {
    const resolver = this.resolvers.get(approvalId);
    const approval = this.pending.get(approvalId);
    if (!resolver || !approval) return false;
    if (resolvedBy) approval.resolvedBy = resolvedBy;
    resolver.resolve(approved);
    return true;
  }

  listPending(): PendingApproval[] {
    return [...this.pending.values()].filter((a) => a.status === "pending");
  }

  getApproval(id: string): PendingApproval | undefined {
    return this.pending.get(id);
  }

  clearResolved(): void {
    for (const [id, approval] of this.pending) {
      if (approval.status !== "pending") this.pending.delete(id);
    }
  }

  private isAutoApproved(toolName: string, args: Record<string, unknown>): boolean {
    for (const pattern of this.autoApprovePatterns) {
      if (pattern === toolName) return true;
      if (pattern.startsWith("path:") && typeof args.path === "string") {
        const pathPattern = pattern.slice(5);
        if ((args.path as string).startsWith(pathPattern)) return true;
      }
      if (pattern.startsWith("cmd:") && typeof args.command === "string") {
        const cmdPattern = pattern.slice(4);
        if ((args.command as string).startsWith(cmdPattern)) return true;
      }
    }
    return false;
  }

  private describeAction(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
      case "write_file":
        return `Write file: ${args.path}`;
      case "edit_file":
        return `Edit file: ${args.path}`;
      case "exec":
        return `Execute: ${args.command}`;
      case "skills_install":
        return `Install skill: ${args.reference ?? "unknown reference"}`;
      case "skills_update":
        return "Update installed skills";
      case "skills_remove":
        return `Remove skill(s): ${Array.isArray(args.references) ? args.references.join(", ") : args.references ?? "selected skills"}`;
      case "create_run":
        return `Create run: ${args.instruction}`;
      case "create_job":
        return `Create job: ${args.name}`;
      case "delete_job":
        return `Delete job: ${args.id}`;
      default:
        return `${toolName}(${Object.keys(args).join(", ")})`;
    }
  }

  private summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const summary: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === "string" && value.length > 500) {
        summary[key] = value.slice(0, 500) + "...";
      } else {
        summary[key] = value;
      }
    }
    return summary;
  }
}
