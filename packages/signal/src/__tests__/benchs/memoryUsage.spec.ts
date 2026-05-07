import { expect, test } from 'vitest'

import { computed, effect, signal } from '../..'

/**
 * Memory usage benchmark tests.
 *
 * NOTE: These tests require Node.js with --expose-gc flag to function correctly.
 * Run with: vitest --experimentalVmIterations=1 --testTimeout=60000
 *
 * In package.json scripts, you can add:
 *   "test:benchs": "node --expose-gc node_modules/vitest/vitest.mjs run --project unit* packages/signal/src/__tests__/benchs/"
 */
test('memory: signal allocation', () => {
  // Force GC and capture baseline
  globalThis.gc?.()
  const start = process.memoryUsage().heapUsed

  const signals = Array.from({ length: 10000 }, () => signal(0))

  globalThis.gc?.()
  const end = process.memoryUsage().heapUsed

  const memKB = (end - start) / 1024
  console.log(`signal (10000): ${memKB.toFixed(2)} KB`)

  expect(signals).toHaveLength(10000)
})

test('memory: computed allocation', () => {
  const signals = Array.from({ length: 10000 }, () => signal(0))

  globalThis.gc?.()
  const start = process.memoryUsage().heapUsed

  const computeds = Array.from({ length: 10000 }, (_, i) =>
    computed(() => signals[i]() + 1),
  )

  globalThis.gc?.()
  const end = process.memoryUsage().heapUsed

  const memKB = (end - start) / 1024
  console.log(`computed (10000): ${memKB.toFixed(2)} KB`)

  expect(computeds).toHaveLength(10000)
})

test('memory: effect allocation', () => {
  const signals = Array.from({ length: 10000 }, () => signal(0))
  const computeds = Array.from({ length: 10000 }, (_, i) =>
    computed(() => signals[i]() + 1),
  )

  globalThis.gc?.()
  const start = process.memoryUsage().heapUsed

  Array.from({ length: 10000 }, (_, i) => effect(() => computeds[i]()))

  globalThis.gc?.()
  const end = process.memoryUsage().heapUsed

  const memKB = (end - start) / 1024
  console.log(`effect (10000): ${memKB.toFixed(2)} KB`)
})

test('memory: propagation tree (100x100 grid of computed+effect)', () => {
  globalThis.gc?.()
  const start = process.memoryUsage().heapUsed

  const w = 100
  const h = 100
  const src = signal(1)

  for (let i = 0; i < w; i++) {
    let last = src
    for (let j = 0; j < h; j++) {
      const prev = last
      last = computed(() => prev() + 1)
      effect(() => last())
    }
  }

  src(src() + 1)

  globalThis.gc?.()
  const end = process.memoryUsage().heapUsed

  const memKB = (end - start) / 1024
  console.log(`tree (100x100 computed+effect): ${memKB.toFixed(2)} KB`)
})
