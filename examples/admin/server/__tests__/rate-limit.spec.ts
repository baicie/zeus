import { describe, expect, it } from 'vitest'

import { AttemptLimiter } from '../rate-limit'

describe('AttemptLimiter', () => {
  it('locks after the configured failures and recovers after the lock', () => {
    let now = 1_000
    const limiter = new AttemptLimiter({
      maxAttempts: 2,
      windowMs: 1_000,
      lockMs: 2_000,
      now: () => now,
    })
    expect(limiter.check(['ip:1']).allowed).toBe(true)
    limiter.recordFailure(['ip:1'])
    limiter.recordFailure(['ip:1'])
    expect(limiter.check(['ip:1']).allowed).toBe(false)
    now += 2_001
    expect(limiter.check(['ip:1']).allowed).toBe(true)
  })

  it('keeps the state map bounded', () => {
    let now = 1_000
    const limiter = new AttemptLimiter({
      maxEntries: 2,
      windowMs: 1_000,
      now: () => now,
    })
    for (let index = 0; index < 10; index += 1) {
      limiter.recordFailure([`account:${index}`])
    }
    expect(limiter.size()).toBeLessThanOrEqual(2)
    now += 2_000
    expect(limiter.check(['account:9']).allowed).toBe(true)
  })
})
