import {
  $TRACK,
  type Accessor,
  IS_DEV,
  type Setter,
  createMemo,
  createRoot,
  createSignal,
  onCleanup,
  untrack,
} from './signal'
import type { Signal } from './types'

const FALLBACK = Symbol('fallback')
function dispose(d: (() => void)[]) {
  for (let i = 0; i < d.length; i++) d[i]()
}

// Modified version of mapSample from S-array[https://github.com/adamhaile/S-array] by Adam Haile
/**
The MIT License (MIT)

Copyright (c) 2017 Adam Haile

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * Reactively transforms an array with a callback function - underlying helper for the `<For>` control flow
 *
 * similar to `Array.prototype.map`, but gets the index as accessor, transforms only values that changed and returns an accessor and reactively tracks changes to the list.
 *
 * @description https://docs.solidjs.com/reference/reactive-utilities/map-array
 */
export function mapArray<T, U>(
  source: Signal<T[]> | (() => T[]),
  mapFn: (item: T, index: number) => U
): () => U[] {
  return createMemo(() => {
    const items = typeof source === 'function' ? source() : source()
    return items.map(mapFn)
  })
}

/**
 * Reactively maps arrays by index instead of value - underlying helper for the `<Index>` control flow
 *
 * similar to `Array.prototype.map`, but gets the value as an accessor, transforms only changed items of the original arrays anew and returns an accessor.
 *
 * @description https://docs.solidjs.com/reference/reactive-utilities/index-array
 */
export function indexArray<T, U>(
  list: Accessor<readonly T[] | undefined | null | false>,
  mapFn: (v: Accessor<T>, i: number) => U,
  options: { fallback?: Accessor<any> } = {}
): () => U[] {
  let items: (T | typeof FALLBACK)[] = [],
    mapped: U[] = [],
    disposers: (() => void)[] = [],
    signals: Setter<T>[] = [],
    len = 0,
    i: number

  onCleanup(() => dispose(disposers))
  return () => {
    const newItems = list() || [],
      newLen = newItems.length
    ;(newItems as any)[$TRACK] // top level tracking
    return untrack(() => {
      if (newLen === 0) {
        if (len !== 0) {
          dispose(disposers)
          disposers = []
          items = []
          mapped = []
          len = 0
          signals = []
        }
        if (options.fallback) {
          items = [FALLBACK]
          mapped[0] = createRoot(disposer => {
            disposers[0] = disposer
            return options.fallback!()
          })
          len = 1
        }
        return mapped
      }
      if (items[0] === FALLBACK) {
        disposers[0]()
        disposers = []
        items = []
        mapped = []
        len = 0
      }

      for (i = 0; i < newLen; i++) {
        if (i < items.length && items[i] !== newItems[i]) {
          signals[i](() => newItems[i])
        } else if (i >= items.length) {
          mapped[i] = createRoot(mapper)
        }
      }
      for (; i < items.length; i++) {
        disposers[i]()
      }
      len = signals.length = disposers.length = newLen
      items = newItems.slice(0)
      return (mapped = mapped.slice(0, len))
    })
    function mapper(disposer: () => void) {
      disposers[i] = disposer
      const [s, set] = IS_DEV
        ? createSignal(newItems[i], { name: 'value' })
        : createSignal(newItems[i])
      signals[i] = set
      return mapFn(s, i)
    }
  }
}

export function filterArray<T>(
  source: Signal<T[]> | (() => T[]),
  filterFn: (item: T, index: number) => boolean
): () => T[] {
  return createMemo(() => {
    const items = typeof source === 'function' ? source() : source()
    return items.filter(filterFn)
  })
}

export function createArray<T>(initialItems: T[] = []): Signal<T[]> {
  return createSignal(initialItems)
}
