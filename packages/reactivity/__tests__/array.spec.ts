import { describe, expect, it } from 'vitest'
import { createSignal } from '../src/signal'
import { mapArray } from '../src/array'

describe('reactivity: array', () => {
  it('should map array reactively', () => {
    const [items, setItems] = createSignal(['a', 'b', 'c'])
    const mapped = mapArray(items, item => item.toUpperCase())

    expect(mapped()).toEqual(['A', 'B', 'C'])

    setItems(['d', 'e'])
    expect(mapped()).toEqual(['D', 'E'])

    setItems([...items(), 'f'])
    expect(mapped()).toEqual(['D', 'E', 'F'])
  })

  it('should handle index in mapping function', () => {
    const [items, setItems] = createSignal(['a', 'b', 'c'])
    const mapped = mapArray(items, (item, index) => `${index()}: ${item}`)

    expect(mapped()).toEqual(['0: a', '1: b', '2: c'])

    setItems(['x', 'y'])
    expect(mapped()).toEqual(['0: x', '1: y'])
  })

  it('should handle empty arrays', () => {
    const [items, setItems] = createSignal<string[]>([])
    const mapped = mapArray(items, item => item.toUpperCase())

    expect(mapped()).toEqual([])

    setItems(['a', 'b'])
    expect(mapped()).toEqual(['A', 'B'])

    setItems([])
    expect(mapped()).toEqual([])
  })
})
