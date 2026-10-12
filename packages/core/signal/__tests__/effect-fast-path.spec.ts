import { describe, expect, it, vi } from 'vitest'

import { computed } from '../src/computed'
import { effect, type ReactiveEffectRunner } from '../src/effect'
import { ref } from '../src/ref'

describe('effect batch flush fast path', () => {
  it('runs a plain effect directly after notification', () => {
    const source = ref(0)
    const runs = vi.fn(() => source.value)
    const runner = effect(runs)
    const trigger = vi.spyOn(runner.effect, 'trigger')

    source.value = 1

    expect(runs).toHaveBeenCalledTimes(2)
    expect(trigger).not.toHaveBeenCalled()
  })

  it('keeps the dirty check for a computed dependency', () => {
    const source = ref(0)
    const memo = computed(() => Math.floor(source.value / 2))
    const runs = vi.fn(() => memo.value)
    const runner = effect(runs)
    const trigger = vi.spyOn(runner.effect, 'trigger')

    source.value = 1

    expect(runs).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveBeenCalledTimes(1)

    source.value = 2

    expect(runs).toHaveBeenCalledTimes(2)
  })

  it('keeps scheduler effects on the scheduler path', () => {
    const source = ref(0)
    const runs = vi.fn(() => source.value)
    const scheduled: ReactiveEffectRunner[] = []
    const runner = effect(runs, {
      scheduler: () => scheduled.push(runner),
    })
    const trigger = vi.spyOn(runner.effect, 'trigger')

    source.value = 1

    expect(runs).toHaveBeenCalledTimes(1)
    expect(scheduled).toEqual([runner])
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('does not run a paused effect until resumed', () => {
    const source = ref(0)
    const runs = vi.fn(() => source.value)
    const runner = effect(runs)
    runner.effect.pause()

    source.value = 1

    expect(runs).toHaveBeenCalledTimes(1)

    runner.effect.resume()

    expect(runs).toHaveBeenCalledTimes(2)
  })
})
