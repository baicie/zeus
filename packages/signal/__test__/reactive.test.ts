import { describe, expect, it, vi } from 'vitest'

import {
  computed,
  effect,
  markRaw,
  reactive,
  readonly,
  shallowReactive,
  shallowReadonly,
  signal,
  toRaw,
} from '../src'

describe('signal keeps original behavior', () => {
  it('runs with signal / computed / effect', () => {
    const count = signal(1)
    const doubled = computed(() => count() * 2)
    const values: number[] = []

    effect(() => {
      values.push(doubled())
    })

    count(2)
    expect(values).toEqual([2, 4])
  })
})

describe('object reactive', () => {
  it('tracks deep object property', () => {
    const state = reactive({ user: { name: 'zeus' } })
    const values: string[] = []

    effect(() => {
      values.push(state.user.name)
    })

    state.user.name = 'alien'
    expect(values).toEqual(['zeus', 'alien'])
  })

  it('tracks key iteration', () => {
    const state = reactive<{ a: number; b?: number }>({ a: 1 })
    const values: string[] = []

    effect(() => {
      values.push(Object.keys(state).join(','))
    })

    state.b = 2
    delete state.a
    expect(values).toEqual(['a', 'a,b', 'b'])
  })
})

describe('array reactive', () => {
  it('tracks index and length', () => {
    const list = reactive([1, 2])
    const values: string[] = []

    effect(() => {
      values.push(`${list.length}:${list[0]}`)
    })

    list[0] = 9
    list.push(3)
    list.length = 1
    expect(values).toEqual(['2:1', '2:9', '3:9', '1:9'])
  })

  it('tracks array iteration', () => {
    const list = reactive([1])
    const values: string[] = []

    effect(() => {
      values.push(list.join(','))
    })

    list.push(2)
    list[1] = 3
    expect(values).toEqual(['1', '1,2', '1,3'])
  })
})

describe('Map and Set reactive', () => {
  it('tracks Map get / set / delete / keys', () => {
    const map = reactive(new Map<string, number>([['a', 1]]))
    const values: string[] = []

    effect(() => {
      values.push(`${map.get('a')}:${Array.from(map.keys()).join(',')}`)
    })

    map.set('a', 2)
    map.set('b', 3)
    map.delete('a')
    expect(values).toEqual(['1:a', '2:a', '2:a,b', 'undefined:b'])
  })

  it('tracks Set size and iteration', () => {
    const set = reactive(new Set([1]))
    const values: string[] = []

    effect(() => {
      values.push(`${set.size}:${Array.from(set).join(',')}`)
    })

    set.add(2)
    set.delete(1)
    expect(values).toEqual(['1:1', '2:1,2', '1:2'])
  })
})

describe('readonly / shallow / raw utilities', () => {
  it('readonly blocks mutation', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const state = readonly({ a: 1 }) as { a: number }
    state.a = 2
    expect(state.a).toBe(1)
    warn.mockRestore()
  })

  it('shallowReactive only proxies first level', () => {
    const state = shallowReactive({ nested: { a: 1 } })
    const values: number[] = []

    effect(() => {
      values.push(state.nested.a)
    })

    state.nested.a = 2
    state.nested = { a: 3 }
    expect(values).toEqual([1, 3])
  })

  it('shallowReadonly only protects first level', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const state = shallowReadonly({ nested: { a: 1 } }) as {
      nested: { a: number }
    }
    state.nested.a = 2
    expect(state.nested.a).toBe(2)
    warn.mockRestore()
  })

  it('toRaw and markRaw work', () => {
    const raw = { a: 1 }
    const state = reactive(raw)
    expect(toRaw(state)).toBe(raw)

    const skipped = markRaw({ a: 1 })
    expect(reactive(skipped)).toBe(skipped)
  })
})
