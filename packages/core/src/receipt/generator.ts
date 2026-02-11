import type { Receipt } from "@undoable/shared";
import { computeFingerprint } from "@undoable/shared";
import type { ReceiptInput, ReceiptFormat } from "./types.js";

export class ReceiptGenerator {
  generate(input: ReceiptInput): Receipt {
    return {
      runId: input.runId,
      userId: input.userId,
      agentId: input.agentId,
      instruction: input.instruction,
      status: input.status,
      fingerprint: input.fingerprint,
      engineVersion: input.engineVersion,
      createdAt: input.createdAt,
      completedAt: input.completedAt,
      stepsTotal: input.plan.steps.length,
      stepsCompleted: input.stepResults.filter((s) => s.success).length,
      stepsFailed: input.stepResults.filter((s) => !s.success).length,
    };
  }

  computeFingerprint(input: ReceiptInput): string {
    return computeFingerprint({
      plan: input.plan,
      capabilities: input.capabilities,
      engineVersion: input.engineVersion,
      diffHash: input.diffHash,
    });
  }

  formatReceipt(receipt: Receipt, format: ReceiptFormat): string {
    if (format === "json") {
      return JSON.stringify(receipt, null, 2);
    }
    return this.formatMarkdown(receipt);
  }

  private formatMarkdown(r: Receipt): string {
    const lines = [
      `# Run Receipt`,
      ``,
      `| Field | Value |`,
      `|-------|-------|`,
      `| Run ID | \`${r.runId}\` |`,
      `| User | \`${r.userId}\` |`,
      `| Agent | \`${r.agentId}\` |`,
      `| Status | **${r.status}** |`,
      `| Instruction | ${r.instruction} |`,
      `| Engine | ${r.engineVersion} |`,
      `| Created | ${r.createdAt} |`,
      `| Completed | ${r.completedAt} |`,
      `| Steps | ${r.stepsCompleted}/${r.stepsTotal} completed, ${r.stepsFailed} failed |`,
      `| Fingerprint | \`${r.fingerprint}\` |`,
    ];
    return lines.join("\n");
  }
}
