export type SessionHealth = "alive" | "stale" | "dead";

export type SessionHeartbeat = {
  sessionId: string;
  agentId?: string;
  lastActivityAt: number;
  lastHeartbeatAt: number;
  connectedAt: number;
  health: SessionHealth;
  sseActive: boolean;
};

export type HeartbeatConfig = {
  heartbeatIntervalMs: number;
  staleThresholdMs: number;
  deadThresholdMs: number;
  cleanupIntervalMs: number;
};

const DEFAULT_CONFIG: HeartbeatConfig = {
  heartbeatIntervalMs: 15_000,
  staleThresholdMs: 60_000,
  deadThresholdMs: 300_000,
  cleanupIntervalMs: 30_000,
};

type SessionEntry = {
  sessionId: string;
  agentId?: string;
  connectedAt: number;
  lastActivityAt: number;
  lastHeartbeatAt: number;
  sseActive: boolean;
  heartbeatTimer: NodeJS.Timeout | null;
  onHeartbeat?: (sessionId: string) => void;
};

export class HeartbeatService {
  private sessions = new Map<string, SessionEntry>();
  private config: HeartbeatConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private onSessionDead?: (sessionId: string) => void;

  constructor(config?: Partial<HeartbeatConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(opts?: { onSessionDead?: (sessionId: string) => void }): void {
    this.onSessionDead = opts?.onSessionDead;
    this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupIntervalMs);
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const entry of this.sessions.values()) {
      if (entry.heartbeatTimer) clearInterval(entry.heartbeatTimer);
    }
    this.sessions.clear();
  }

  register(sessionId: string, opts?: {
    agentId?: string;
    onHeartbeat?: (sessionId: string) => void;
  }): void {
    const now = Date.now();
    const existing = this.sessions.get(sessionId);
    if (existing?.heartbeatTimer) clearInterval(existing.heartbeatTimer);

    const entry: SessionEntry = {
      sessionId,
      agentId: opts?.agentId,
      connectedAt: now,
      lastActivityAt: now,
      lastHeartbeatAt: now,
      sseActive: true,
      heartbeatTimer: null,
      onHeartbeat: opts?.onHeartbeat,
    };

    entry.heartbeatTimer = setInterval(() => {
      entry.lastHeartbeatAt = Date.now();
      entry.onHeartbeat?.(sessionId);
    }, this.config.heartbeatIntervalMs);

    this.sessions.set(sessionId, entry);
  }

  unregister(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    if (entry.heartbeatTimer) clearInterval(entry.heartbeatTimer);
    entry.sseActive = false;
    entry.lastActivityAt = Date.now();
    this.sessions.set(sessionId, entry);
  }

  recordActivity(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) entry.lastActivityAt = Date.now();
  }

  ping(sessionId: string): SessionHealth {
    const entry = this.sessions.get(sessionId);
    if (!entry) return "dead";
    entry.lastHeartbeatAt = Date.now();
    entry.lastActivityAt = Date.now();
    return this.computeHealth(entry);
  }

  getHealth(sessionId: string): SessionHealth {
    const entry = this.sessions.get(sessionId);
    if (!entry) return "dead";
    return this.computeHealth(entry);
  }

  listSessions(): SessionHeartbeat[] {
    const result: SessionHeartbeat[] = [];
    for (const entry of this.sessions.values()) {
      result.push({
        sessionId: entry.sessionId,
        agentId: entry.agentId,
        lastActivityAt: entry.lastActivityAt,
        lastHeartbeatAt: entry.lastHeartbeatAt,
        connectedAt: entry.connectedAt,
        health: this.computeHealth(entry),
        sseActive: entry.sseActive,
      });
    }
    return result;
  }

  get activeCount(): number {
    let count = 0;
    for (const entry of this.sessions.values()) {
      if (this.computeHealth(entry) === "alive") count++;
    }
    return count;
  }

  private computeHealth(entry: SessionEntry): SessionHealth {
    const now = Date.now();
    const elapsed = now - entry.lastActivityAt;
    if (elapsed >= this.config.deadThresholdMs) return "dead";
    if (elapsed >= this.config.staleThresholdMs) return "stale";
    return "alive";
  }

  private cleanup(): void {
    const toRemove: string[] = [];
    for (const [id, entry] of this.sessions) {
      if (this.computeHealth(entry) === "dead" && !entry.sseActive) {
        if (entry.heartbeatTimer) clearInterval(entry.heartbeatTimer);
        toRemove.push(id);
        this.onSessionDead?.(id);
      }
    }
    for (const id of toRemove) this.sessions.delete(id);
  }
}
