import { computed } from '../src/computed'
import { effect, stop } from '../src/effect'
import { createEffect, createRoot } from '../src/primitives'
import { watch } from '../src/watch'
import { reactive } from '../src/reactive'
import { ref } from '../src/ref'

describe('signal error isolation', () => {
  test('a failing reactive write does not poison later notifications', () => {
    const obj = reactive({ v: 0 })
    const seen: number[] = []
    createRoot(dispose => {
      createEffect(() => {
        if (obj.v === 1) obj.v = 2
      })
      createEffect(() => {
        seen.push(obj.v)
      })

      expect(() => {
        obj.v = 1
      }).toThrow(/cannot synchronously update its own dependencies/)
      obj.v = 3

      expect(seen).toEqual([0, 2, 3])
      dispose()
    })
  })

  test('one failing subscriber does not starve the remaining subscribers', () => {
    const source = ref(0)
    const seen: number[] = []
    createRoot(dispose => {
      createEffect(() => {
        seen.push(source.value)
      })
      createEffect(() => {
        if (source.value === 1) source.value = 2
      })

      expect(() => {
        source.value = 1
      }).toThrow(/cannot synchronously update its own dependencies/)
      expect(seen).toEqual([0, 1, 2])
      source.value = 3
      expect(seen).toEqual([0, 1, 2, 3])
      dispose()
    })
  })

  test('a throwing array mutation leaves reactivity usable', () => {
    const items = reactive([1, 2, 3])
    const tick = ref(0)
    const observed: number[] = []
    const dispose = createRoot(root => {
      createEffect(() => {
        observed.push(items.length + tick.value)
      })
      return root
    })

    expect(() => {
      ;(items as unknown as { splice(value: symbol): void }).splice(Symbol())
    }).toThrow()
    items.push(4)
    tick.value = 1

    expect(observed).toEqual([3, 4, 5])
    dispose()
  })
})


describe('signal failure recovery', () => {
  test('a computed that throws is re-evaluated on the next read', () => {
    const source = ref(0)
    let attempts = 0
    const value = computed(() => {
      if (source.value === 1 && attempts++ === 0) {
        throw new Error('computed failed')
      }
      return source.value
    })
    createRoot(dispose => {
      createEffect(() => {
        void value.value
      })
      expect(value.value).toBe(0)
      expect(() => {
        source.value = 1
      }).toThrow(/computed failed/)
      expect(value.value).toBe(1)
      dispose()
    })
  })

  test('a failed immediate watch does not leave an unstoppable watcher', () => {
    const source = ref(0)
    let calls = 0
    expect(() =>
      watch(
        source,
        () => {
          calls++
          throw new Error('watch failed')
        },
        { immediate: true },
      ),
    ).toThrow(/watch failed/)
    expect(() => {
      source.value = 1
    }).not.toThrow()
    expect(calls).toBe(1)
  })

  test('resume after stop does not run the effect', () => {
    const source = ref(0)
    let calls = 0
    const runner = effect(() => {
      void source.value
      calls++
    })
    runner.effect.pause()
    stop(runner)
    runner.effect.resume()
    source.value = 1
    expect(calls).toBe(1)
  })
})
