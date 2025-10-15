import { describe, expect, it } from 'vitest'
import { computed, effect, signal } from '../src/index.js'

describe('Signal Memory Usage', () => {
  it('should have reasonable memory usage for signals', () => {
    // 强制垃圾回收（如果可用）
    if (globalThis.gc) {
      globalThis.gc()
    }

    const initialMemory = getMemoryUsage()

    // 创建 10000 个信号
    const signals = Array.from({ length: 10000 }, () => signal(0))

    // 强制垃圾回收以确保测量准确
    if (globalThis.gc) {
      globalThis.gc()
    }

    const afterSignalsMemory = getMemoryUsage()
    const signalsMemory = afterSignalsMemory - initialMemory

    // 验证信号创建成功
    expect(signals).toHaveLength(10000)
    signals.forEach(s => expect(s()).toBe(0))

    // 内存使用应该在合理范围内（每个信号大约 1-2KB）
    expect(signalsMemory).toBeLessThan(50 * 1024 * 1024) // 50MB
    // 如果内存测量不准确（返回负数或0），跳过最小值检查
    if (signalsMemory > 0) {
      expect(signalsMemory).toBeGreaterThan(1024 * 1024) // 1MB
    }
  })

  it('should have reasonable memory usage for computed values', () => {
    // 强制垃圾回收
    if (globalThis.gc) {
      globalThis.gc()
    }

    const initialMemory = getMemoryUsage()

    // 创建 10000 个信号
    const signals = Array.from({ length: 10000 }, () => signal(0))

    // 创建 10000 个计算值
    const computeds = Array.from({ length: 10000 }, (_, i) =>
      computed(() => signals[i]() + 1),
    )

    // 强制垃圾回收以确保测量准确
    if (globalThis.gc) {
      globalThis.gc()
    }

    const afterComputedsMemory = getMemoryUsage()
    const computedsMemory = afterComputedsMemory - initialMemory

    // 验证计算值创建成功
    expect(computeds).toHaveLength(10000)
    computeds.forEach((c, i) => expect(c()).toBe(1))

    // 内存使用应该在合理范围内
    expect(computedsMemory).toBeLessThan(100 * 1024 * 1024) // 100MB
    // 如果内存测量不准确（返回负数或0），跳过最小值检查
    if (computedsMemory > 0) {
      expect(computedsMemory).toBeGreaterThan(2 * 1024 * 1024) // 2MB
    }
  })

  it('should have reasonable memory usage for effects', () => {
    // 强制垃圾回收
    if (globalThis.gc) {
      globalThis.gc()
    }

    const initialMemory = getMemoryUsage()

    // 创建信号和计算值
    const signals = Array.from({ length: 10000 }, () => signal(0))
    const computeds = Array.from({ length: 10000 }, (_, i) =>
      computed(() => signals[i]() + 1),
    )

    // 创建 10000 个 effect
    Array.from({ length: 10000 }, (_, i) => effect(() => computeds[i]()))

    // 强制垃圾回收以确保测量准确
    if (globalThis.gc) {
      globalThis.gc()
    }

    const afterEffectsMemory = getMemoryUsage()
    const effectsMemory = afterEffectsMemory - initialMemory

    // 内存使用应该在合理范围内
    expect(effectsMemory).toBeLessThan(150 * 1024 * 1024) // 150MB
    // 如果内存测量不准确（返回负数或0），跳过最小值检查
    if (effectsMemory > 0) {
      expect(effectsMemory).toBeGreaterThan(3 * 1024 * 1024) // 3MB
    }
  })

  it('should handle complex signal trees efficiently', () => {
    // 强制垃圾回收
    if (globalThis.gc) {
      globalThis.gc()
    }

    const initialMemory = getMemoryUsage()

    // 创建复杂的信号树 (100x100)
    const w = 100
    const h = 100
    const src = signal(1)

    let last = src
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) {
        const prev = last
        last = computed(() => prev() + 1)
        effect(() => last())
      }
    }

    // 触发更新
    src(src() + 1)

    // 强制垃圾回收以确保测量准确
    if (globalThis.gc) {
      globalThis.gc()
    }

    const afterTreeMemory = getMemoryUsage()
    const treeMemory = afterTreeMemory - initialMemory

    // 验证结果
    expect(src()).toBe(2)
    expect(last()).toBe(2 + w * h)

    // 内存使用应该在合理范围内
    expect(treeMemory).toBeLessThan(200 * 1024 * 1024) // 200MB
    // 如果内存测量不准确（返回负数或0），跳过最小值检查
    if (treeMemory > 0) {
      expect(treeMemory).toBeGreaterThan(5 * 1024 * 1024) // 5MB
    }
  })

  it('should not leak memory when signals are disposed', () => {
    // 强制垃圾回收
    if (globalThis.gc) {
      globalThis.gc()
    }

    const initialMemory = getMemoryUsage()

    // 创建大量信号和 effect
    const signals = Array.from({ length: 5000 }, () => signal(0))
    const computeds = Array.from({ length: 5000 }, (_, i) =>
      computed(() => signals[i]() + 1),
    )
    const effects = Array.from({ length: 5000 }, (_, i) =>
      effect(() => computeds[i]()),
    )

    // 强制垃圾回收以确保测量准确
    if (globalThis.gc) {
      globalThis.gc()
    }

    const afterCreationMemory = getMemoryUsage()

    // 清理所有 effect（模拟组件卸载）
    effects.forEach(dispose => dispose())

    // 强制垃圾回收
    if (globalThis.gc) {
      globalThis.gc()
    }

    const afterDisposalMemory = getMemoryUsage()
    const memoryDifference = afterDisposalMemory - afterCreationMemory

    // 清理后内存应该减少或至少不显著增加
    expect(memoryDifference).toBeLessThan(10 * 1024 * 1024) // 10MB
  })
})

// 辅助函数：获取内存使用情况
function getMemoryUsage(): number {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed
  }

  // 浏览器环境下的近似内存使用
  if (typeof performance !== 'undefined' && (performance as any).memory) {
    return (performance as any).memory.usedJSHeapSize
  }

  // 如果无法获取内存信息，返回 0
  return 0
}
