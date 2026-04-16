import { describe, expect, it } from 'vitest'

import { computed, effect, signal } from '../index'

describe('Signal System', () => {
  it('should create a signal', () => {
    const count = signal(0)
    expect(count()).toBe(0)
  })

  it('should update signal value', () => {
    const count = signal(0)
    count(5)
    expect(count()).toBe(5)
  })

  it('should create computed signal', () => {
    const count = signal(2)
    const double = computed(() => count() * 2)

    expect(double()).toBe(4)

    count(3)
    expect(double()).toBe(6)
  })

  it('should run effect', () => {
    const count = signal(0)
    let effectCount = 0

    effect(() => {
      effectCount++
      return count()
    })

    expect(effectCount).toBe(1)

    count(1)
    expect(effectCount).toBe(2)
  })
})
