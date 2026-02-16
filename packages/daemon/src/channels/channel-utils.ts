import type { ChannelId, ChannelMessage } from "./types.js";

export type BackoffState = {
  attempt: number;
  timer: ReturnType<typeof setTimeout> | null;
  maxAttempts: number;
  baseMs: number;
  maxMs: number;
};

export function createBackoff(maxAttempts = 10, baseMs = 1000, maxMs = 60_000): BackoffState {
  return { attempt: 0, timer: null, maxAttempts, baseMs, maxMs };
}

export function nextBackoffMs(state: BackoffState): number | null {
  if (state.attempt >= state.maxAttempts) return null;
  const ms = Math.min(state.baseMs * 2 ** state.attempt, state.maxMs);
  const jitter = Math.random() * ms * 0.3;
  state.attempt++;
  return Math.floor(ms + jitter);
}

export function resetBackoff(state: BackoffState): void {
  state.attempt = 0;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

export function scheduleReconnect(
  state: BackoffState,
  reconnectFn: () => Promise<void>,
  onGaveUp?: () => void,
): void {
  const ms = nextBackoffMs(state);
  if (ms === null) {
    onGaveUp?.();
    return;
  }
  state.timer = setTimeout(async () => {
    try {
      await reconnectFn();
      resetBackoff(state);
    } catch {
      scheduleReconnect(state, reconnectFn, onGaveUp);
    }
  }, ms);
}

export type RateLimitBucket = {
  tokens: number;
  lastRefill: number;
};

export type RateLimiterConfig = {
  maxPerMinute: number;
};

const DEFAULT_RATE_LIMIT: RateLimiterConfig = { maxPerMinute: 20 };

export class RateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  private config: RateLimiterConfig;

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = { ...DEFAULT_RATE_LIMIT, ...config };
  }

  allow(userId: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(userId);
    if (!bucket) {
      bucket = { tokens: this.config.maxPerMinute, lastRefill: now };
      this.buckets.set(userId, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    if (elapsed >= 60_000) {
      bucket.tokens = this.config.maxPerMinute;
      bucket.lastRefill = now;
    } else {
      const refill = Math.floor((elapsed / 60_000) * this.config.maxPerMinute);
      if (refill > 0) {
        bucket.tokens = Math.min(this.config.maxPerMinute, bucket.tokens + refill);
        bucket.lastRefill = now;
      }
    }

    if (bucket.tokens <= 0) return false;
    bucket.tokens--;
    return true;
  }

  reset(): void {
    this.buckets.clear();
  }
}

export type FilterConfig = {
  allowDMs: boolean;
  allowGroups: boolean;
  userAllowlist?: string[];
  userBlocklist?: string[];
};

const DEFAULT_FILTER: FilterConfig = { allowDMs: true, allowGroups: true };

export function shouldAcceptMessage(msg: ChannelMessage, config?: Partial<FilterConfig>): boolean {
  const f = { ...DEFAULT_FILTER, ...config };

  if (msg.chatType === "direct" && !f.allowDMs) return false;
  if (msg.chatType === "group" && !f.allowGroups) return false;

  if (f.userBlocklist?.includes(msg.from)) return false;
  if (f.userAllowlist && f.userAllowlist.length > 0 && !f.userAllowlist.includes(msg.from)) return false;

  return true;
}

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

export function isMediaWithinLimit(sizeBytes: number, maxBytes = MAX_MEDIA_BYTES): boolean {
  return sizeBytes <= maxBytes;
}

export type ChannelStatusInfo = {
  channelId: ChannelId;
  connected: boolean;
  accountName?: string;
  error?: string;
  qrDataUrl?: string;
  reconnectAttempts: number;
  lastConnectedAt?: number;
  lastDisconnectedAt?: number;
  lastErrorAt?: number;
  startedAt?: number;
};

export function createStatusTracker(channelId: ChannelId): ChannelStatusInfo {
  return { channelId, connected: false, reconnectAttempts: 0 };
}

export type QueuedMessage = {
  msg: ChannelMessage;
  receivedAt: number;
};

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private processing = false;
  private debounceMs: number;
  private maxQueueSize: number;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private handler: (msg: ChannelMessage) => Promise<void>,
    opts?: { debounceMs?: number; maxQueueSize?: number },
  ) {
    this.debounceMs = opts?.debounceMs ?? 500;
    this.maxQueueSize = opts?.maxQueueSize ?? 100;
  }

  enqueue(msg: ChannelMessage): void {
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
    }
    this.queue.push({ msg, receivedAt: Date.now() });
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.processing || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.debounceMs);
  }

  private async flush(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        await this.handler(item.msg);
      } catch { }
    }
    this.processing = false;
  }

  get pending(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue.length = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
