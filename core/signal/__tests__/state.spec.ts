import { describe, expect, it, vi } from 'vitest'

import { state, effect, computed, isValueState } from '../src'

describe('state', () => {
  it('creates value state for primitive', () => {
    const count = state(0)

    expect(isValueState(count)).toBe(true)
    expect(count.value).toBe(0)

    count.value++
    expect(count.value).toBe(1)
  })

  it('creates value state for string', () => {
    const name = state('Zeus')

    expect(isValueState(name)).toBe(true)
    expect(name.value).toBe('Zeus')

    name.value = 'ZeusJS'
    expect(name.value).toBe('ZeusJS')
  })

  it('creates value state for null', () => {
    const val = state<string | null>(null)

    expect(isValueState(val)).toBe(true)
    expect(val.value).toBe(null)

    val.value = 'initialized'
    expect(val.value).toBe('initialized')
  })

  it('creates value state for undefined', () => {
    const val = state<string | undefined>(undefined)

    expect(isValueState(val)).toBe(true)
    expect(val.value).toBe(undefined)

    val.value = 'initialized'
    expect(val.value).toBe('initialized')
  })

  it('creates value state for Date (non-proxyable)', () => {
    const now = new Date()
    const date = state(now) as any as { value: Date }

    expect(isValueState(date)).toBe(true)
    expect(date.value).toBe(now)
  })

  it('creates value state for function (non-proxyable)', () => {
    const fn = state((() => 42) as any) as any as { value: () => number }

    expect(isValueState(fn)).toBe(true)
    expect(fn.value()).toBe(42)
  })

  it('creates reactive state for plain object', () => {
    const user = state({
      name: 'Zeus',
      age: 1,
    })

    expect(isValueState(user)).toBe(false)
    expect(user.name).toBe('Zeus')

    user.name = 'ZeusJS'
    expect(user.name).toBe('ZeusJS')
  })

  it('creates reactive state for array', () => {
    const list = state([{ id: 1, title: 'learn compiler' }])

    expect(isValueState(list)).toBe(false)
    expect(list.length).toBe(1)

    list.push({ id: 2, title: 'learn runtime' })
    expect(list.length).toBe(2)
  })

  it('creates reactive state for Map', () => {
    const map = state(new Map<string, number>())

    expect(isValueState(map)).toBe(false)
    expect(map.get('a')).toBeUndefined()

    map.set('a', 1)
    expect(map.get('a')).toBe(1)
  })

  it('creates reactive state for Set', () => {
    const set = state(new Set<string>())

    expect(isValueState(set)).toBe(false)
    expect(set.has('item')).toBe(false)

    set.add('item')
    expect(set.has('item')).toBe(true)
  })

  it('tracks primitive value state in effect', () => {
    const count = state(0)
    const fn = vi.fn(() => count.value)

    effect(fn)

    expect(fn).toHaveBeenCalledTimes(1)

    count.value++

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('tracks reactive object property in effect', () => {
    const user = state({ name: 'Zeus' })
    const fn = vi.fn(() => user.name)

    effect(fn)

    expect(fn).toHaveBeenCalledTimes(1)

    user.name = 'ZeusJS'

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('tracks array length in effect', () => {
    const list = state([{ id: 1 }])
    let length = 0

    effect(() => {
      length = list.length
    })

    expect(length).toBe(1)

    list.push({ id: 2 })

    expect(length).toBe(2)
  })

  it('tracks Map.get in effect', () => {
    const map = state(new Map<string, number>())
    let value: number | undefined

    effect(() => {
      value = map.get('a')
    })

    expect(value).toBeUndefined()

    map.set('a', 1)

    expect(value).toBe(1)
  })

  it('supports computed from primitive and object state', () => {
    const count = state(1)
    const user = state({ name: 'Zeus' })

    const title = computed(() => `${user.name}:${count.value}`)

    expect(title.value).toBe('Zeus:1')

    count.value++
    user.name = 'ZeusJS'

    expect(title.value).toBe('ZeusJS:2')
  })

  it('state() without args returns writable value state', () => {
    const val = state<string>()

    expect(isValueState(val)).toBe(true)
    expect(val.value).toBe(undefined)

    val.value = 'initialized'
    expect(val.value).toBe('initialized')
  })

  it('tracks reactive array mutation', () => {
    const list = state(['a', 'b', 'c'])
    let joined = ''

    effect(() => {
      joined = list.join(',')
    })

    expect(joined).toBe('a,b,c')

    list[0] = 'A'
    expect(joined).toBe('A,b,c')

    list.pop()
    expect(joined).toBe('A,b')
  })
})
