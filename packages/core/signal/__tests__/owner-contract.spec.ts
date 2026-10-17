import { describe, expect, it, vi } from 'vitest'

import {
  batch,
  createEffect,
  createRoot,
  createSignal,
  onCleanup,
} from '../src'
import {
  effect,
  effectScope,
  getCurrentScope,
  onScopeDispose,
} from '../src/internal'

describe('owner and error contracts', () => {
  it('restores the owning scope when an effect reruns', () => {
    const [parent, updateParent] = createSignal(0)
    const [child, updateChild] = createSignal(0)
    const observations: number[] = []
    let dispose!: () => void
    createRoot(stop => {
      dispose = stop
      createEffect(() => {
        if (parent() > 0) createEffect(() => observations.push(child()))
      })
    })
    updateParent(1)
    updateChild(1)
    dispose()
    updateChild(2)
    expect(observations).toEqual([0, 1])
  })

  it('does not execute effects created by an owner that is already disposing', () => {
    const run = vi.fn()
    const root = effectScope()
    root.run(() => onScopeDispose(() => createEffect(run)))
    root.stop()
    expect(run).not.toHaveBeenCalled()
  })

  it('runs cleanup immediately if an invalidated async scope is restored', async () => {
    const root = effectScope()
    const run = vi.fn()
    const cleanup = vi.fn()
    const continuation = root.run(async () => {
      expect(getCurrentScope()).toBe(root)
      await Promise.resolve()
      expect(getCurrentScope()).toBeUndefined()
      root.on()
      try {
        createEffect(run)
        onCleanup(cleanup)
      } finally {
        root.off()
      }
    })
    root.stop()
    await continuation
    expect(run).not.toHaveBeenCalled()
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(getCurrentScope()).toBeUndefined()
  })

  it('preserves the original setup failure after attempting all root cleanup', () => {
    const original = new Error('setup failed')
    const cleanup = vi.fn()
    expect(() =>
      createRoot(() => {
        onCleanup(() => {
          throw new Error('cleanup failed')
        })
        onCleanup(cleanup)
        throw original
      }),
    ).toThrow(original)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('preserves an initial effect failure even if its cleanup also fails', () => {
    const original = new Error('effect failed')
    expect(() =>
      effect(() => {
        onCleanup(() => {
          throw new Error('effect cleanup failed')
        })
        throw original
      }),
    ).toThrow(original)
  })

  it('preserves a falsy batch callback error while flushing the pending updates', () => {
    const [source, write] = createSignal(0)
    const values: number[] = []
    createRoot(dispose => {
      createEffect(() => {
        if (source() > 0) throw new Error('flush failed')
      })
      createEffect(() => values.push(source()))
      let threw = false
      try {
        batch(() => {
          write(1)
          throw undefined
        })
      } catch (error) {
        threw = true
        expect(error).toBeUndefined()
      }
      expect(threw).toBe(true)
      expect(values).toEqual([0, 1])
      dispose()
    })
  })

  it('does not subscribe an effect to signals read by a setter updater', () => {
    const [trigger, updateTrigger] = createSignal(0)
    const [value, write] = createSignal(0)
    const run = vi.fn(() => {
      trigger()
      write(previous => previous + 1)
    })
    createRoot(dispose => {
      createEffect(run)
      write(10)
      expect(run).toHaveBeenCalledTimes(1)
      updateTrigger(1)
      expect(value()).toBe(11)
      expect(run).toHaveBeenCalledTimes(2)
      dispose()
    })
  })

  it('rejects a public effect synchronously writing its tracked dependency', () => {
    const [read, write] = createSignal(0)
    expect(() =>
      createRoot(() => createEffect(() => write(read() + 1))),
    ).toThrow(
      'reactive effect cannot synchronously update its own dependencies',
    )
    const observed: number[] = []
    createRoot(dispose => {
      createEffect(() => observed.push(read()))
      write(2)
      dispose()
    })
    expect(observed).toEqual([1, 2])
  })
})
