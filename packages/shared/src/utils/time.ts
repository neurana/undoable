export function nowISO(): string {
  return new Date().toISOString();
}

export function elapsedMs(startMs: number): number {
  return Date.now() - startMs;
}
