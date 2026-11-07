import { createEffect, createRoot } from '../src/primitives'
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
