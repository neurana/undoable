export type Capability = {
  scope: string;
  pattern: string;
};

export type CapabilityGrant = {
  id: string;
  userId: string;
  scope: string;
  capability: string;
  grantedAt: string;
  expiresAt?: string;
};

export const CAPABILITY_PREFIXES = [
  "fs.read",
  "fs.write",
  "git.commit",
  "shell.exec",
  "net.connect",
  "http.request",
  "browser.navigate",
  "browser.execute",
  "browser.download",
  "secrets.use",
  "agent.spawn",
] as const;

export type CapabilityPrefix = (typeof CAPABILITY_PREFIXES)[number];

export function parseCapability(raw: string): Capability {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) {
    return { scope: raw, pattern: "*" };
  }
  return {
    scope: raw.slice(0, colonIdx),
    pattern: raw.slice(colonIdx + 1),
  };
}

export function matchesCapability(grant: string, requested: string): boolean {
  const g = parseCapability(grant);
  const r = parseCapability(requested);

  if (g.scope !== r.scope) return false;
  if (g.pattern === "*") return true;
  if (g.pattern === r.pattern) return true;

  if (g.pattern.endsWith("/**")) {
    const prefix = g.pattern.slice(0, -3);
    return r.pattern.startsWith(prefix);
  }

  if (g.pattern.endsWith("/*")) {
    const prefix = g.pattern.slice(0, -1);
    return r.pattern.startsWith(prefix) && !r.pattern.slice(prefix.length).includes("/");
  }

  return false;
}
