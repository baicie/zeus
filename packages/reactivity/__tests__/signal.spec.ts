import { describe, expect, it, vi } from 'vitest'
import {
  batch,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
} from '../src/signal'

describe('reactivity: signal', () => {
  it('should create a readable signal', () => {
    const [count] = createSignal(0)
    expect(count()).toBe(0)
  })

  it('should update signal value', () => {
    const [count, setCount] = createSignal(0)
    setCount(1)
    expect(count()).toBe(1)
  })

  it('should update signal with function updater', () => {
    const [count, setCount] = createSignal(0)
    setCount(prev => prev + 1)
    expect(count()).toBe(1)
  })

  it('should track dependencies', () => {
    const [count, setCount] = createSignal(0)
    const [double, setDouble] = createSignal(0)

    createRoot(dispose => {
      createEffect(() => {
        setDouble(count() * 2)
      })

      expect(double()).toBe(0)
      setCount(1)
      expect(double()).toBe(2)
      setCount(2)
      expect(double()).toBe(4)

      dispose()
    })
  })

  it('should create memo', () => {
    const [count, setCount] = createSignal(0)
    const double = createMemo(() => count() * 2)

    expect(double()).toBe(0)
    setCount(1)
    expect(double()).toBe(2)
    setCount(2)
    expect(double()).toBe(4)
  })

  it('should batch updates', () => {
    const [count, setCount] = createSignal(0)
    const effectFn = vi.fn()

    createRoot(dispose => {
      createEffect(() => {
        effectFn(count())
      })

      expect(effectFn).toHaveBeenCalledTimes(1)

      batch(() => {
        setCount(1)
        setCount(2)
        setCount(3)
      })

      // Effect should only run once after batch
      expect(effectFn).toHaveBeenCalledTimes(2)
      expect(effectFn).toHaveBeenLastCalledWith(3)

      dispose()
    })
  })
})
