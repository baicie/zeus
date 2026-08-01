import { describe, expect, it, vi } from 'vitest'

import {
  batch,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  onCleanup,
} from '../src'

describe('Zeus reactive primitives', () => {
  it('reads and writes signals with values and updater functions', () => {
    const [count, setCount] = createSignal(1)

    expect(count()).toBe(1)
    expect(setCount(2)).toBe(2)
    expect(setCount(previous => previous + 3)).toBe(5)
    expect(count()).toBe(5)
  })

  it('stores objects as shallow signal values', () => {
    const initial = { count: 1 }
    const [value, setValue] = createSignal(initial)
    const next = { count: 2 }

    expect(value()).toBe(initial)
    setValue(next)
    expect(value()).toBe(next)
  })

  it('caches memos until a dependency changes', () => {
    const [count, setCount] = createSignal(1)
    const compute = vi.fn(() => count() * 2)
    const doubled = createMemo(compute)

    expect(doubled()).toBe(2)
    expect(doubled()).toBe(2)
    expect(compute).toHaveBeenCalledTimes(1)

    setCount(2)
    expect(doubled()).toBe(4)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('stops owned effects and runs cleanup when a root is disposed', () => {
    const [count, setCount] = createSignal(0)
    const observed: number[] = []
    const cleanup = vi.fn()
    let dispose!: () => void

    createRoot(rootDispose => {
      dispose = rootDispose
      createEffect(() => {
        observed.push(count())
        onCleanup(cleanup)
      })
    })

    setCount(1)
    expect(observed).toEqual([0, 1])
    expect(cleanup).toHaveBeenCalledTimes(1)

    dispose()
    dispose()
    setCount(2)

    expect(observed).toEqual([0, 1])
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it('runs every cleanup registered by an effect', () => {
    const [count, setCount] = createSignal(0)
    const firstCleanup = vi.fn()
    const secondCleanup = vi.fn()

    createRoot(() => {
      createEffect(() => {
        count()
        onCleanup(firstCleanup)
        onCleanup(secondCleanup)
      })
    })

    setCount(1)

    expect(firstCleanup).toHaveBeenCalledTimes(1)
    expect(secondCleanup).toHaveBeenCalledTimes(1)
  })

  it('flushes dependent effects once at the end of a batch', () => {
    const [left, setLeft] = createSignal(1)
    const [right, setRight] = createSignal(2)
    const values: number[] = []

    createRoot(() => {
      createEffect(() => {
        values.push(left() + right())
      })
    })

    batch(() => {
      setLeft(3)
      setRight(4)
    })

    expect(values).toEqual([3, 7])
  })
})
