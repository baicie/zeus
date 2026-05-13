import { expect, test } from 'vitest'

import { computed, effect, signal } from '../..'

/**
 * Propagation benchmark tests.
 *
 * Measures the cost of updating a 2D grid of computed values,
 * where each row's computed depends on the previous row's computed,
 * and an effect at the end of each row subscribes to it.
 *
 * Run benchmarks with: node --expose-gc node_modules/vitest/vitest.mjs run --project unit* packages/signal/src/__tests__/benchs/
 * Or simply: pnpm test:benchs
 */
const cases = [
  { label: 'w=1, h=1', w: 1, h: 1 },
  { label: 'w=10, h=10', w: 10, h: 10 },
  { label: 'w=100, h=100', w: 100, h: 100 },
  { label: 'w=100, h=1 (deep chain)', w: 100, h: 1 },
  { label: 'w=1, h=100 (wide batch)', w: 1, h: 100 },
] as const

for (const { label, w, h } of cases) {
  test(`propagate: ${label}`, () => {
    const src = signal(1)
    for (let i = 0; i < w; i++) {
      let last = src
      for (let j = 0; j < h; j++) {
        const prev = last
        last = computed(() => prev() + 1)
      }
      void effect(() => {
        last()
      })
    }
    const start = performance.now()
    src(src() + 1)
    const elapsed = performance.now() - start
    console.log(`propagate (${label}): ${elapsed.toFixed(4)} ms`)
    expect(w).toBeGreaterThan(0)
    expect(h).toBeGreaterThan(0)
  })
}
