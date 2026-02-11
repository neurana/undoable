import { matchesCapability } from "@undoable/shared";

export class CapabilityStore {
  private grants = new Map<string, Set<string>>();

  grant(scope: string, capability: string): void {
    const existing = this.grants.get(scope) ?? new Set();
    existing.add(capability);
    this.grants.set(scope, existing);
  }

  revoke(scope: string, capability: string): void {
    this.grants.get(scope)?.delete(capability);
  }

  check(scope: string, requested: string): boolean {
    const scopeGrants = this.grants.get(scope);
    if (!scopeGrants) return false;
    for (const grant of scopeGrants) {
      if (matchesCapability(grant, requested)) return true;
    }
    return false;
  }

  checkAll(scope: string, requested: string[]): { granted: string[]; denied: string[] } {
    const granted: string[] = [];
    const denied: string[] = [];
    for (const cap of requested) {
      if (this.check(scope, cap)) {
        granted.push(cap);
      } else {
        denied.push(cap);
      }
    }
    return { granted, denied };
  }

  listGrants(scope: string): string[] {
    return Array.from(this.grants.get(scope) ?? []);
  }

  clear(scope: string): void {
    this.grants.delete(scope);
  }
}
