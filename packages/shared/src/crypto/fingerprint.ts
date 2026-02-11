import { sha256 } from "./hash.js";
import type { PlanGraph, Receipt } from "../types/runs.js";

export function computeFingerprint(params: {
  plan: PlanGraph;
  capabilities: string[];
  engineVersion: string;
  diffHash?: string;
}): string {
  const canonical = JSON.stringify({
    plan: params.plan,
    capabilities: params.capabilities.toSorted(),
    engineVersion: params.engineVersion,
    diffHash: params.diffHash ?? "",
  });
  return `sha256:${sha256(canonical)}`;
}

export function verifyFingerprint(receipt: Receipt, expectedFingerprint: string): boolean {
  return receipt.fingerprint === expectedFingerprint;
}
