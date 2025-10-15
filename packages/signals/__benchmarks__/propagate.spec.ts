import { describe, expect, it } from 'vitest'
import { computed, effect, signal } from '../src/index.js'

describe('Signal Propagation Performance', () => {
  it('should handle signal propagation efficiently', () => {
    const testCases = [
      { w: 1, h: 1 },
      { w: 1, h: 10 },
      { w: 1, h: 100 },
      { w: 10, h: 1 },
      { w: 10, h: 10 },
      { w: 10, h: 100 },
      { w: 100, h: 1 },
      { w: 100, h: 10 },
      { w: 100, h: 100 },
    ]

    for (const { w, h } of testCases) {
      const startTime = performance.now()

      // 创建信号传播链
      const src = signal(1)
      const effects: (() => void)[] = []

      for (let i = 0; i < w; i++) {
        let last = src
        for (let j = 0; j < h; j++) {
          const prev = last
          last = computed(() => prev() + 1)
        }
        effects.push(() => last())
      }

      // 创建 effect
      effects.forEach(effectFn => effect(effectFn))

      // 触发更新
      src(2)

      const endTime = performance.now()
      const duration = endTime - startTime

      // 验证结果正确性
      expect(src()).toBe(2)

      // 性能断言：对于小规模测试，应该在合理时间内完成
      if (w * h <= 100) {
        expect(duration).toBeLessThan(100) // 100ms
      } else if (w * h <= 1000) {
        expect(duration).toBeLessThan(500) // 500ms
      } else {
        expect(duration).toBeLessThan(2000) // 2s
      }
    }
  })

  it('should handle deep signal chains efficiently', () => {
    const depth = 1000
    const startTime = performance.now()

    // 创建深度信号链
    let current = signal(0)
    const chain = [current]

    for (let i = 1; i < depth; i++) {
      const prev = current
      current = computed(() => prev() + 1)
      chain.push(current)
    }

    // 创建 effect 监听最后一个信号
    effect(() => current())

    // 触发更新
    chain[0](1)

    const endTime = performance.now()
    const duration = endTime - startTime

    // 验证结果
    expect(current()).toBe(depth)

    // 性能断言
    expect(duration).toBeLessThan(100) // 应该在100ms内完成
  })

  it('should handle wide signal trees efficiently', () => {
    const width = 100
    const startTime = performance.now()

    // 创建宽度信号树
    const root = signal(0)
    const leaves: ReturnType<typeof computed>[] = []

    for (let i = 0; i < width; i++) {
      const leaf = computed(() => root() + i)
      leaves.push(leaf)
      effect(() => leaf())
    }

    // 触发更新
    root(1)

    const endTime = performance.now()
    const duration = endTime - startTime

    // 验证结果
    leaves.forEach((leaf, i) => {
      expect(leaf()).toBe(1 + i)
    })

    // 性能断言
    expect(duration).toBeLessThan(50) // 应该在50ms内完成
  })
})
