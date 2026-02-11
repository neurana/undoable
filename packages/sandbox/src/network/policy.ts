export type NetworkPolicy = {
  mode: "none" | "restricted" | "open";
  allowedHosts?: string[];
};

export function resolveNetworkMode(policy: NetworkPolicy): "none" | "bridge" | "host" {
  if (policy.mode === "none") return "none";
  if (policy.mode === "open") return "bridge";
  return "bridge";
}

export function isHostAllowed(host: string, allowedHosts: string[]): boolean {
  for (const pattern of allowedHosts) {
    if (pattern === "*") return true;
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1);
      if (host.endsWith(suffix) || host === pattern.slice(2)) return true;
    }
    if (host === pattern) return true;
  }
  return false;
}
