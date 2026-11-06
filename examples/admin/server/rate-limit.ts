/**
 * Bounded, in-memory login attempt limiter. Keys are opaque strings such as
 * `ip:<address>` and `account:<normalized-email>`; entries are pruned on every
 * access and the map never grows beyond maxEntries.
 */
export interface AttemptLimiterOptions {
  readonly maxAttempts?: number
  readonly windowMs?: number
  readonly lockMs?: number
  readonly maxEntries?: number
  readonly now?: () => number
}

export interface AttemptDecision {
  readonly allowed: boolean
  readonly retryAfterMs: number
}

interface AttemptState {
  failures: number
  windowStartedAt: number
  lockedUntil: number
  lastSeenAt: number
}

const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_WINDOW_MS = 15 * 60 * 1000
const DEFAULT_LOCK_MS = 15 * 60 * 1000
const DEFAULT_MAX_ENTRIES = 10_000

export class AttemptLimiter {
  private readonly maxAttempts: number
  private readonly windowMs: number
  private readonly lockMs: number
  private readonly maxEntries: number
  private readonly now: () => number
  private readonly entries = new Map<string, AttemptState>()

  constructor(options: AttemptLimiterOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
    this.lockMs = options.lockMs ?? DEFAULT_LOCK_MS
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.now = options.now ?? Date.now
  }

  check(keys: readonly string[]): AttemptDecision {
    const now = this.now()
    let retryAfterMs = 0
    for (const key of keys) {
      const state = this.entries.get(key)
      if (!state) continue
      state.lastSeenAt = now
      if (state.lockedUntil > now) {
        retryAfterMs = Math.max(retryAfterMs, state.lockedUntil - now)
        continue
      }
      if (
        state.failures >= this.maxAttempts &&
        state.windowStartedAt + this.windowMs > now
      ) {
        // The window expired for counting but the lock was not set yet; treat
        // it as a lock so a burst cannot continue across the boundary.
        state.lockedUntil = now + this.lockMs
        retryAfterMs = Math.max(retryAfterMs, this.lockMs)
      }
    }
    this.prune(now)
    return { allowed: retryAfterMs === 0, retryAfterMs }
  }

  recordFailure(keys: readonly string[]): AttemptDecision {
    const now = this.now()
    let retryAfterMs = 0
    for (const key of keys) {
      const state = this.entries.get(key) ?? {
        failures: 0,
        windowStartedAt: now,
        lockedUntil: 0,
        lastSeenAt: now,
      }
      if (state.windowStartedAt + this.windowMs <= now) {
        state.failures = 0
        state.windowStartedAt = now
        state.lockedUntil = 0
      }
      state.failures += 1
      state.lastSeenAt = now
      if (state.failures >= this.maxAttempts) {
        state.lockedUntil = now + this.lockMs
        retryAfterMs = Math.max(retryAfterMs, this.lockMs)
      }
      this.entries.set(key, state)
    }
    this.prune(now)
    return { allowed: retryAfterMs === 0, retryAfterMs }
  }

  reset(keys: readonly string[]): void {
    for (const key of keys) this.entries.delete(key)
  }

  size(): number {
    return this.entries.size
  }

  private prune(now: number): void {
    for (const [key, state] of this.entries) {
      const expired =
        state.lockedUntil <= now && state.windowStartedAt + this.windowMs <= now
      if (expired) this.entries.delete(key)
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }
}
