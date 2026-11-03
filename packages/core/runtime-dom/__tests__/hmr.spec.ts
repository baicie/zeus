import { createEffect, createRoot } from '@zeus-js/signal'
import { getCurrentScope } from '@zeus-js/signal/internal'
import { describe, expect, it, vi } from 'vitest'

import { bindEffect } from '../src/bindings'
import { setScopeErrorBoundaryHandler } from '../src/errorBoundaryContext'
import { createHmrState } from '../src/hmr'

function harness() {
  const listeners = new Map<string, (data: unknown) => void>()
  const hot = {
    on: (event: string, callback: (data: unknown) => void) =>
      listeners.set(event, callback),
    off: (event: string) => listeners.delete(event),
    invalidate: vi.fn(),
  }
  const initial = {
    version: 1,
    signature: 'compiler-certified-module',
    bindings: [
      { id: 1, kind: 'text', value: 'Hello' },
      { id: 2, kind: 'style', value: 'color: red' },
    ],
  }
  const next = {
    ...initial,
    bindings: initial.bindings.map(binding => ({
      ...binding,
      value: `${binding.value}!`,
    })),
  }
  const state = createHmrState(hot, '/src/main.tsx', initial)
  const send = (previous = initial, updated = next) =>
    listeners.get('zeus:hmr-patch')?.({
      filename: '/src/main.tsx',
      previous,
      next: updated,
    })
  return { hot, initial, next, state, send, listeners }
}

describe('compiler HMR binding cells', () => {
  it('rolls back a DOM binding failure before an application error boundary can dispose the tree', () => {
    const { state, send, hot } = harness()
    const handler = vi.fn()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispose = createRoot(dispose => {
      setScopeErrorBoundaryHandler(getCurrentScope(), handler)
      bindEffect(
        () => state.read(1),
        false,
        value => {
          if (value.endsWith('!')) throw new Error('DOM write failed')
        },
        { kind: 'text', target: {} as Node },
      )
      return dispose
    })
    try {
      send()
      expect(handler).not.toHaveBeenCalled()
      expect(state.read(1)).toBe('Hello')
      expect(hot.invalidate).toHaveBeenCalledWith(
        expect.stringContaining('ZEUS_HMR_PATCH_FAILED'),
      )
    } finally {
      dispose()
      log.mockRestore()
    }
  })
  it('updates existing roots in one batch and supplies the new value to later mounts', () => {
    const { state, send } = harness()
    const first: string[] = []
    const second: string[] = []
    const mount = (runs: string[]) =>
      createRoot(dispose => {
        createEffect(() => runs.push(`${state.read(1)} / ${state.read(2)}`))
        return dispose
      })
    const disposeFirst = mount(first)
    const disposeSecond = mount(second)
    try {
      send()
      expect(first).toEqual(['Hello / color: red', 'Hello! / color: red!'])
      expect(second).toEqual(first)
      disposeFirst()
      const third: string[] = []
      const disposeThird = mount(third)
      expect(third).toEqual(['Hello! / color: red!'])
      disposeThird()
    } finally {
      disposeFirst()
      disposeSecond()
    }
  })

  it('ignores duplicate data and rejects skipped, reordered or mismatched patches before writes', () => {
    const { state, send, hot, initial, next, listeners } = harness()
    let runs = 0
    const dispose = createRoot(dispose => {
      createEffect(() => {
        state.read(1)
        runs++
      })
      return dispose
    })
    try {
      send()
      send()
      expect(runs).toBe(2)
      const later = {
        ...next,
        bindings: next.bindings.map(binding => ({
          ...binding,
          value: `${binding.value}!`,
        })),
      }
      send(initial, later)
      expect(hot.invalidate).toHaveBeenCalledWith(
        expect.stringContaining('ZEUS_HMR_STALE_PATCH'),
      )
      expect(state.read(1)).toBe('Hello!')
      send(next, { ...later, signature: 'different module' })
      expect(hot.invalidate).toHaveBeenCalledWith(
        expect.stringContaining('ZEUS_HMR_PLAN_MISMATCH'),
      )
      listeners.get('zeus:hmr-patch')?.({ filename: '/other.tsx' })
      expect(hot.invalidate).toHaveBeenCalledTimes(2)
    } finally {
      dispose()
    }
  })

  it('rolls back a failed update and asks Vite to reload', () => {
    const { state, send, hot } = harness()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const values: string[] = []
    const dispose = createRoot(dispose => {
      createEffect(() => {
        const value = state.read(1)
        if (value.endsWith('!')) throw new Error('binding write failed')
        values.push(value)
      })
      return dispose
    })
    try {
      send()
      expect(state.read(1)).toBe('Hello')
      expect(state.read(2)).toBe('color: red')
      expect(values).toEqual(['Hello', 'Hello'])
      expect(hot.invalidate).toHaveBeenCalledWith(
        expect.stringContaining('ZEUS_HMR_PATCH_FAILED'),
      )
    } finally {
      dispose()
      log.mockRestore()
    }
  })

  it('removes its message subscription on module disposal', () => {
    const { state, send, listeners } = harness()
    state.dispose()
    expect(listeners.size).toBe(0)
    send()
    expect(() => state.read(1)).toThrow('ZEUS_HMR_UNKNOWN_BINDING')
  })

  it('emits HMR reasons to the DevTools timeline without changing patch behavior', () => {
    const events: Array<{ type: string; payload?: Record<string, unknown> }> =
      []
    vi.stubGlobal('window', {
      __ZEUS_DEVTOOLS_HOOK__: {
        emit: (event: { type: string; payload?: Record<string, unknown> }) =>
          events.push(event),
      },
    })
    try {
      const { state, send, initial, next } = harness()
      send()
      send(initial, { ...next, signature: 'different' })
      state.dispose()

      expect(events.map(event => event.type)).toEqual([
        'hmr:patch',
        'hmr:invalidate',
        'hmr:dispose',
      ])
      expect(events[0]?.payload).toMatchObject({
        reason: 'literal-binding',
        filename: '/src/main.tsx',
      })
      expect(events[1]?.payload).toMatchObject({ reason: 'plan-mismatch' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps HMR updates working when a DevTools observer throws', () => {
    vi.stubGlobal('window', {
      __ZEUS_DEVTOOLS_HOOK__: {
        emit: () => {
          throw new Error('broken observer')
        },
      },
    })
    try {
      const { state, send } = harness()
      expect(() => send()).not.toThrow()
      expect(state.read(1)).toBe('Hello!')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
