import { beforeAll, describe, expect, it, vi } from 'vitest'

import * as first from '../src/internal'

let second: typeof first

beforeAll(async () => {
  // Keep the first module's actual closures, then load a second engine instance.
  vi.resetModules()
  second = await import('../src/internal')
})

describe('physical engine boundary protocol', () => {
  it('rejects cross-engine signal, memo and proxy dependencies', () => {
    const [value] = first.createSignal(0)
    const memo = first.createMemo(() => value() * 2)
    const state = first.state({ count: 1 })
    for (const read of [value, memo, () => state.count]) {
      expect(() => second.createRoot(() => second.createEffect(read))).toThrow(
        'different Zeus signal engine',
      )
    }
    const foreignMemo = second.createMemo(value)
    expect(foreignMemo).toThrow('different Zeus signal engine')
  })

  it('rejects effect and cleanup registration under a foreign owner', () => {
    first.createRoot(dispose => {
      expect(() => second.createEffect(() => {})).toThrow(
        'different Zeus signal engine',
      )
      expect(() => second.onCleanup(() => {})).toThrow(
        'different Zeus signal engine',
      )
      expect(() => second.onScopeDispose(() => {}, true)).toThrow(
        'different Zeus signal engine',
      )
      expect(() => second.effectScope()).toThrow('different Zeus signal engine')
      dispose()
    })
  })

  it('allows independent detached roots and deliberate untracked snapshots', () => {
    const [left, setLeft] = first.createSignal(0)
    const [right, setRight] = second.createSignal(10)
    const observed: number[] = []
    let stopRight!: () => void
    first.createRoot(stopLeft => {
      first.createEffect(() => observed.push(left()))
      second.createRoot(dispose => {
        stopRight = dispose
        second.createEffect(() => observed.push(right()))
      })
      first.createEffect(() => first.untrack(right))
      setLeft(1)
      setRight(11)
      stopLeft()
    })
    setLeft(2)
    setRight(12)
    stopRight()
    expect(observed).toEqual([0, 10, 1, 11, 12])
  })

  it('restores contexts after cross-engine errors and falsy exceptions', () => {
    const [value, write] = first.createSignal(0)
    expect(() => second.createRoot(() => second.createEffect(value))).toThrow(
      'different Zeus signal engine',
    )
    let threw = false
    try {
      second.createRoot(() => {
        throw undefined
      })
    } catch (error) {
      threw = true
      expect(error).toBeUndefined()
    }
    expect(threw).toBe(true)
    const seen: number[] = []
    first.createRoot(dispose => {
      first.createEffect(() => seen.push(value()))
      write(1)
      dispose()
    })
    expect(seen).toEqual([0, 1])
  })

  it('unlinks out-of-order scope restoration across engines', () => {
    const left = first.effectScope(true)
    const right = second.effectScope(true)
    left.on()
    right.on()
    left.off()
    expect(() => first.createEffect(() => {})).toThrow(
      'different Zeus signal engine',
    )
    right.off()
    left.stop()
    right.stop()
    expect(() => first.createRoot(dispose => dispose())).not.toThrow()
  })
})

it('keeps foreign-owner detection after sibling continuations unlink out of order', () => {
  const firstScope = first.effectScope(true)
  const secondScope = first.effectScope(true)
  firstScope.on()
  secondScope.on()
  firstScope.off()
  try {
    expect(() => second.createEffect(() => {})).toThrow(
      'different Zeus signal engine',
    )
  } finally {
    secondScope.off()
    firstScope.stop()
    secondScope.stop()
  }
})

it('treats a detached root setup as an untracked boundary even inside a foreign effect', () => {
  const [trigger, updateTrigger] = first.createSignal(0)
  const [value, write] = second.createSignal(10)
  const observed: number[] = []
  first.createRoot(dispose => {
    first.createEffect(() => {
      trigger()
      second.createRoot(stop => {
        observed.push(value())
        stop()
      })
    })
    write(11)
    expect(observed).toEqual([10])
    updateTrigger(1)
    expect(observed).toEqual([10, 11])
    dispose()
  })
})
