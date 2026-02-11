import { hashApiKey, timingSafeCompare } from "@undoable/shared";

export function hashKey(apiKey: string): string {
  return hashApiKey(apiKey);
}

export function verifyKey(apiKey: string, storedHash: string): boolean {
  const computed = hashApiKey(apiKey);
  return timingSafeCompare(computed, storedHash);
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1]!;
}

export function extractApiKey(header: string | undefined): string | null {
  if (!header) return null;
  if (header.startsWith("nrn_")) return header;
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0] === "ApiKey") return parts[1]!;
  return null;
}
