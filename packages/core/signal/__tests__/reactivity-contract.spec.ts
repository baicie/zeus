import { describe, expect, it, vi } from 'vitest'

import {
  batch,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  onCleanup,
} from '../src'
import {
  createRuntimeDiagnosticsSession,
  effect,
  effectScope,
  onScopeDispose,
  stop,
} from '../src/internal'

describe('reactivity engine contract', () => {
  it('keeps function values explicit and signal containers shallow', () => {
    const original = () => 1
    const replacement = () => 2
    const [callback, setCallback] = createSignal(original)
    setCallback(() => replacement)
    expect(callback()).toBe(replacement)

    const value = { count: 0 }
    const [read, write] = createSignal(value)
    const observed: number[] = []
    createRoot(dispose => {
      createEffect(() => observed.push(read().count))
      value.count++
      write(value)
      expect(observed).toEqual([0])
      write({ count: 2 })
      expect(observed).toEqual([0, 2])
      dispose()
    })
  })

  it('evaluates a lazy diamond once and skips unchanged derived results', () => {
    const [source, setSource] = createSignal(0)
    const leftCompute = vi.fn(() => source() % 2)
    const rightCompute = vi.fn(() => source() % 2)
    const left = createMemo(leftCompute)
    const right = createMemo(rightCompute)
    const sumCompute = vi.fn(() => left() + right())
    const sum = createMemo(sumCompute)
    expect(sumCompute).not.toHaveBeenCalled()

    const observed: number[] = []
    createRoot(dispose => {
      createEffect(() => observed.push(sum()))
      setSource(2)
      expect(observed).toEqual([0])
      expect(sumCompute).toHaveBeenCalledTimes(1)
      setSource(3)
      expect(observed).toEqual([0, 2])
      expect(sumCompute).toHaveBeenCalledTimes(2)
      expect(leftCompute).toHaveBeenCalledTimes(3)
      expect(rightCompute).toHaveBeenCalledTimes(3)
      dispose()
    })
  })

  it('drops old branch dependencies and flushes nested batches synchronously', () => {
    const [chooseLeft, setChooseLeft] = createSignal(true)
    const [left, setLeft] = createSignal(1)
    const [right, setRight] = createSignal(10)
    const observed: number[] = []
    createRoot(dispose => {
      createEffect(() => observed.push(chooseLeft() ? left() : right()))
      batch(() => {
        setLeft(2)
        batch(() => {
          setChooseLeft(false)
          setRight(20)
        })
        expect(observed).toEqual([1])
      })
      expect(observed).toEqual([1, 20])
      setLeft(3)
      expect(observed).toEqual([1, 20])
      setRight(30)
      expect(observed).toEqual([1, 20, 30])
      dispose()
    })
  })

  it('restores the outer tracker after a nested effect and stops child owners', () => {
    const [outer, setOuter] = createSignal(0)
    const [inner, setInner] = createSignal(0)
    const observed: number[] = []
    const nestedObserved: number[] = []
    const root = effectScope()
    root.run(() => {
      createEffect(() => {
        const child = effectScope()
        child.run(() => createEffect(() => nestedObserved.push(inner())))
        onCleanup(() => child.stop())
        observed.push(outer())
      })
    })
    setOuter(1)
    setInner(1)
    expect(observed).toEqual([0, 1])
    expect(nestedObserved).toEqual([0, 0, 1])
    root.stop()
    setOuter(2)
    setInner(2)
    expect(observed).toEqual([0, 1])
    expect(nestedObserved).toEqual([0, 0, 1])
  })

  it('keeps detached roots independent from the surrounding owner', () => {
    const [source, setSource] = createSignal(0)
    const outer = effectScope()
    const observed: number[] = []
    let dispose!: () => void
    outer.run(() => {
      createRoot(stopRoot => {
        dispose = stopRoot
        createEffect(() => observed.push(source()))
      })
    })
    outer.stop()
    setSource(1)
    expect(observed).toEqual([0, 1])
    dispose()
    setSource(2)
    expect(observed).toEqual([0, 1])
  })

  it('continues disposing sibling effects and child scopes after cleanup fails', () => {
    const [source, setSource] = createSignal(0)
    const observed: string[] = []
    const cleanup: string[] = []
    const failure = new Error('first cleanup failed')
    const root = effectScope()
    root.run(() => {
      createEffect(() => {
        source()
        onCleanup(() => {
          cleanup.push('first')
          throw failure
        })
        onCleanup(() => cleanup.push('second'))
      })
      createEffect(() => observed.push(`sibling:${source()}`))
      onScopeDispose(() => cleanup.push('scope'))
      effectScope().run(() => {
        createEffect(() => observed.push(`child:${source()}`))
        onScopeDispose(() => cleanup.push('child'))
      })
    })

    expect(() => root.stop()).toThrow(failure)
    setSource(1)
    expect(observed).toEqual(['sibling:0', 'child:0'])
    expect(cleanup).toEqual(['first', 'second', 'scope', 'child'])
    expect(root.effects).toHaveLength(0)
    expect(root.scopes).toHaveLength(0)
    expect(() => root.stop()).not.toThrow()
  })

  it('continues remaining scope cleanups and child disposal after a scope cleanup fails', () => {
    const cleanups: string[] = []
    const root = effectScope()
    root.run(() => {
      onScopeDispose(() => {
        cleanups.push('first')
        throw new Error('scope cleanup failed')
      })
      onScopeDispose(() => cleanups.push('second'))
      effectScope().run(() => onScopeDispose(() => cleanups.push('child')))
    })
    expect(() => root.stop()).toThrow('scope cleanup failed')
    expect(cleanups).toEqual(['first', 'second', 'child'])
    expect(() => root.stop()).not.toThrow()
  })

  it('restores the running state after an update cleanup throws', () => {
    const [source, setSource] = createSignal(0)
    const observed: number[] = []
    let shouldThrow = true
    const runner = effect(() => {
      observed.push(source())
      onCleanup(() => {
        if (shouldThrow) {
          shouldThrow = false
          throw new Error('update cleanup failed')
        }
      })
    })
    expect(() => setSource(1)).toThrow('update cleanup failed')
    setSource(2)
    expect(observed).toEqual([0, 2])
    stop(runner)
  })

  it('marks effects disposed and runs onStop even if a cleanup throws', () => {
    const diagnostics = createRuntimeDiagnosticsSession()
    const onStop = vi.fn()
    const runner = diagnostics.run(() =>
      effect(
        () =>
          onCleanup(() => {
            throw new Error('stop cleanup failed')
          }),
        { onStop },
      ),
    )
    expect(() => stop(runner)).toThrow('stop cleanup failed')
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(diagnostics.snapshot().effectsDisposed).toBe(1)
    expect(() => stop(runner)).not.toThrow()
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('propagates falsy cleanup failures after all callbacks have run', () => {
    const cleanup = vi.fn()
    const runner = effect(() => {
      onCleanup(() => {
        throw undefined
      })
      onCleanup(cleanup)
    })
    let threw = false
    try {
      stop(runner)
    } catch (error) {
      threw = true
      expect(error).toBeUndefined()
    }
    expect(threw).toBe(true)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('propagates falsy batch failures while allowing sibling effects to finish', () => {
    const [source, setSource] = createSignal(0)
    const observed: number[] = []
    createRoot(dispose => {
      createEffect(() => {
        if (source() === 1) throw undefined
      })
      createEffect(() => observed.push(source()))
      let threw = false
      try {
        batch(() => setSource(1))
      } catch (error) {
        threw = true
        expect(error).toBeUndefined()
      }
      expect(threw).toBe(true)
      expect(observed).toEqual([0, 1])
      dispose()
    })
  })
})
