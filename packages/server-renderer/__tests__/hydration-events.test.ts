import { describe, expect, it } from 'vitest'
import {
  applyHydrationEvents,
  clearSsrHydrationEvents,
  getHydrationCapabilitySnapshot,
  getSsrHydrationEvents,
  ssrHydrationEvents,
} from '../src'

function createTarget() {
  const adds: string[] = []
  const removes: string[] = []
  const addOptions: unknown[] = []
  const removeOptions: unknown[] = []
  return {
    adds,
    removes,
    addOptions,
    removeOptions,
    addEventListener(type: string, _listener?: unknown, options?: unknown) {
      adds.push(type)
      addOptions.push(options)
    },
    removeEventListener(type: string, _listener?: unknown, options?: unknown) {
      removes.push(type)
      removeOptions.push(options)
    },
  }
}

describe('ssrHydrationEvents', () => {
  it('supports register -> read -> clear lifecycle', () => {
    clearSsrHydrationEvents()
    ssrHydrationEvents([{ name: 'click', strategy: 'delegate' }])
    const registered = getSsrHydrationEvents()
    expect(registered.length).toBe(1)
    expect(registered[0].name).toBe('click')
    clearSsrHydrationEvents()
    expect(getSsrHydrationEvents().length).toBe(0)
  })

  it('dedupes by name and strategy', () => {
    clearSsrHydrationEvents()
    const list = ssrHydrationEvents([
      { name: 'click', strategy: 'delegate' },
      { name: 'click', strategy: 'native' },
      { name: 'click', strategy: 'native' },
    ])
    const native = list.filter(
      item => item.name === 'click' && item.strategy === 'native',
    )
    const delegate = list.filter(
      item => item.name === 'click' && item.strategy === 'delegate',
    )
    expect(native.length).toBe(1)
    expect(delegate.length).toBe(1)
    clearSsrHydrationEvents()
  })

  it('applies hydration events with strategy fallback', () => {
    clearSsrHydrationEvents()
    const delegateTarget = createTarget()
    const nativeTarget = createTarget()
    ssrHydrationEvents([
      { name: 'click', strategy: 'native' },
      { name: 'focus', strategy: 'invalid' },
    ])
    const result = applyHydrationEvents(getSsrHydrationEvents(), {
      delegateTarget,
      nativeTarget,
      supportsEventListenerOptions: true,
    })
    expect(result.applied.length).toBe(2)
    expect(result.attached).toBe(2)
    expect(result.applied[0].strategy).toBe('native')
    expect(result.applied[1].strategy).toBe('delegate')
    expect(result.skipped).toBe(0)
    expect(result.deduped).toBe(0)
    expect(result.targets).toBe(2)
    expect(result.optionFallbackCount).toBe(0)
    expect(result.degradedPassive).toBe(0)
    expect(result.degradedOnce).toBe(0)
    expect(nativeTarget.adds).toEqual(['click'])
    expect(delegateTarget.adds).toEqual(['focus'])
    result.handle.dispose()
    expect(nativeTarget.removes).toEqual(['click'])
    expect(delegateTarget.removes).toEqual(['focus'])
    expect(result.handle.disposed).toBe(true)
    result.handle.dispose()
    expect(nativeTarget.removes).toEqual(['click'])
    expect(delegateTarget.removes).toEqual(['focus'])
    clearSsrHydrationEvents()
  })

  it('dedupes attach calls for same name and strategy', () => {
    const delegateTarget = createTarget()
    const nativeTarget = createTarget()
    const result = applyHydrationEvents(
      [
        { name: 'click', strategy: 'native' },
        { name: 'click', strategy: 'native' },
        { name: 'click', strategy: 'delegate' },
      ],
      { delegateTarget, nativeTarget, supportsEventListenerOptions: true },
    )
    expect(result.attached).toBe(2)
    expect(result.deduped).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.targets).toBe(2)
    expect(result.optionFallbackCount).toBe(0)
    expect(result.degradedPassive).toBe(0)
    expect(result.degradedOnce).toBe(0)
    expect(nativeTarget.adds).toEqual(['click'])
    expect(delegateTarget.adds).toEqual(['click'])
    result.handle.dispose()
  })

  it('supports eventTargetsByName routing with higher priority', () => {
    const delegateTarget = createTarget()
    const nativeTarget = createTarget()
    const focusTarget = createTarget()
    const result = applyHydrationEvents(
      [
        { name: 'focus', strategy: 'native' },
        { name: 'click', strategy: 'native' },
      ],
      {
        delegateTarget,
        nativeTarget,
        eventTargetsByName: { focus: focusTarget },
      },
    )
    expect(result.attached).toBe(2)
    expect(focusTarget.adds).toEqual(['focus'])
    expect(nativeTarget.adds).toEqual(['click'])
    expect(delegateTarget.adds).toEqual([])
    result.handle.dispose()
  })

  it('uses fallback target and reports skipped when no target available', () => {
    const fallbackTarget = createTarget()
    const result = applyHydrationEvents(
      [
        { name: 'click', strategy: 'delegate' },
        { name: 'focus', strategy: 'native' },
      ],
      { fallbackTarget },
    )
    expect(result.attached).toBe(2)
    expect(result.skipped).toBe(0)
    expect(fallbackTarget.adds).toEqual(['click', 'focus'])
    result.handle.dispose()

    const noTarget = applyHydrationEvents([
      { name: 'blur', strategy: 'delegate' },
    ])
    expect(noTarget.attached).toBe(0)
    expect(noTarget.skipped).toBe(1)
  })

  it('supports capture/passive/once options and fallback mode', () => {
    const nativeTarget = createTarget()
    const modern = applyHydrationEvents(
      [
        {
          name: 'scroll',
          strategy: 'native',
          capture: true,
          passive: true,
          once: true,
        },
      ],
      { nativeTarget, supportsEventListenerOptions: true },
    )
    expect(modern.attached).toBe(1)
    expect(modern.optionFallbackCount).toBe(0)
    expect(modern.degradedPassive).toBe(0)
    expect(modern.degradedOnce).toBe(0)
    expect(nativeTarget.addOptions[0]).toEqual({
      capture: true,
      passive: true,
      once: true,
    })
    modern.handle.dispose()
    expect(nativeTarget.removeOptions[0]).toBe(true)

    const legacyTarget = createTarget()
    const legacy = applyHydrationEvents(
      [
        {
          name: 'scroll',
          strategy: 'native',
          capture: true,
          passive: true,
          once: true,
        },
      ],
      { nativeTarget: legacyTarget, supportsEventListenerOptions: false },
    )
    expect(legacy.optionFallbackCount).toBe(1)
    expect(legacy.degradedPassive).toBe(1)
    expect(legacy.degradedOnce).toBe(1)
    expect(legacy.capabilitySource).toBe('manual')
    expect(legacy.supportsEventListenerOptions).toBe(false)
    expect(legacyTarget.addOptions[0]).toBe(true)
  })

  it('keeps metric consistency for batch attach/dispose', () => {
    const nativeTarget = createTarget()
    const events: Array<{ name: string; strategy: 'native' }> = []
    for (let i = 0; i < 100; i++) {
      events.push({ name: 'evt' + i, strategy: 'native' })
    }
    const result = applyHydrationEvents(events, {
      nativeTarget,
      supportsEventListenerOptions: true,
    })
    expect(result.attached).toBe(100)
    expect(result.applied.length).toBe(100)
    expect(result.deduped).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.capabilitySource).toBe('manual')
    expect(result.supportsEventListenerOptions).toBe(true)
    result.handle.dispose()
    expect(nativeTarget.removes.length).toBe(100)
  })

  it('keeps metric consistency for larger batches (500/1000)', () => {
    const nativeTarget = createTarget()
    const events500: Array<{ name: string; strategy: 'native' }> = []
    const events1000: Array<{ name: string; strategy: 'native' }> = []
    for (let i = 0; i < 500; i++) {
      events500.push({ name: 'evt500_' + i, strategy: 'native' })
    }
    for (let i = 0; i < 1000; i++) {
      events1000.push({ name: 'evt1000_' + i, strategy: 'native' })
    }

    const t1 = Date.now()
    const r500 = applyHydrationEvents(events500, {
      nativeTarget,
      supportsEventListenerOptions: true,
    })
    const d1 = Date.now() - t1
    expect(r500.attached).toBe(500)
    expect(r500.applied.length).toBe(500)
    expect(r500.skipped).toBe(0)
    expect(r500.deduped).toBe(0)
    expect(d1).toBeGreaterThanOrEqual(0)
    r500.handle.dispose()

    const t2 = Date.now()
    const r1000 = applyHydrationEvents(events1000, {
      nativeTarget,
      supportsEventListenerOptions: true,
    })
    const d2 = Date.now() - t2
    expect(r1000.attached).toBe(1000)
    expect(r1000.applied.length).toBe(1000)
    expect(r1000.skipped).toBe(0)
    expect(r1000.deduped).toBe(0)
    expect(d2).toBeGreaterThanOrEqual(0)
    r1000.handle.dispose()
  })

  it('exposes capability snapshot', () => {
    const manual = getHydrationCapabilitySnapshot({
      supportsEventListenerOptions: false,
    })
    expect(manual.source).toBe('manual')
    expect(manual.supportsEventListenerOptions).toBe(false)
    const auto = getHydrationCapabilitySnapshot()
    expect(auto.source).toBe('auto')
  })
})
