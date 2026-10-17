import { describe, expect, it } from 'vitest'

import { createEffect, createRoot, createSignal } from '../src'
import { effect } from '../src/internal'
import { reactive, shallowReactive } from '../src/reactive'

describe('public reactivity boundary', () => {
  it('keeps createSignal shallow while reactive is an explicit internal tool', () => {
    const raw = { nested: { count: 0 } }
    const [read, write] = createSignal(raw)
    const values: number[] = []

    createRoot(dispose => {
      createEffect(() => values.push(read().nested.count))
      raw.nested.count++
      expect(values).toEqual([0])
      write({ nested: { count: 1 } })
      expect(values).toEqual([0, 1])
      dispose()
    })

    const deep = reactive(raw)
    const shallow = shallowReactive(raw)
    expect(deep.nested).not.toBe(raw.nested)
    expect(shallow.nested).toBe(raw.nested)
  })

  it('tracks explicit Map and Set mutations only through internal proxies', () => {
    const map = reactive(new Map<string, number>())
    const set = reactive(new Set<string>())
    let mapValue = 0
    let hasValue = false

    effect(() => {
      mapValue = map.get('count') ?? 0
      hasValue = set.has('ready')
    })
    expect([mapValue, hasValue]).toEqual([0, false])

    map.set('count', 2)
    set.add('ready')
    expect([mapValue, hasValue]).toEqual([2, true])
  })
})
