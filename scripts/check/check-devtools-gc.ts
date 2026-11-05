import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createDevtoolsConsumer } from '../../packages/devtools/consumer/src'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/devtools-gc')
const collectGarbage = (globalThis as unknown as { gc?: () => void }).gc
interface WeakRefLike<T extends object> {
  deref(): T | undefined
}
interface FinalizationRegistryLike<T> {
  register(target: object, heldValue: T): void
}
const WeakRefConstructor = (
  globalThis as unknown as {
    WeakRef: new <T extends object>(target: T) => WeakRefLike<T>
  }
).WeakRef
const FinalizationRegistryConstructor = (
  globalThis as unknown as {
    FinalizationRegistry: new <T>(
      cleanup: (heldValue: T) => void,
    ) => FinalizationRegistryLike<T>
  }
).FinalizationRegistry

assert(collectGarbage, 'Run this gate with node --expose-gc')
assert(WeakRefConstructor, 'WeakRef is required for this gate')
assert(
  FinalizationRegistryConstructor,
  'FinalizationRegistry is required for this gate',
)
fs.mkdirSync(output, { recursive: true })

const consumer = createDevtoolsConsumer(undefined, { historyLimit: 20 })
const finalized = new Set<'custom-element' | 'binding'>()
const registry = new FinalizationRegistryConstructor<
  'custom-element' | 'binding'
>(kind => finalized.add(kind))

function createTargets(): {
  customElement: WeakRefLike<Node>
  binding: WeakRefLike<Node>
} {
  const customElement = { nodeType: 1 } as unknown as Node
  const binding = { nodeType: 3 } as unknown as Node
  registry.register(customElement, 'custom-element')
  registry.register(binding, 'binding')
  consumer.consume({
    id: 1,
    timestamp: 1,
    type: 'custom-element:connect',
    target: customElement,
    targetId: 10,
    name: 'z-gc-card',
  })
  consumer.consume({
    id: 2,
    timestamp: 2,
    type: 'binding:commit',
    target: binding,
    targetId: 11,
    bindingId: 12,
    effectId: 13,
    payload: { kind: 'text', once: false },
  })
  consumer.consume({
    id: 3,
    timestamp: 3,
    type: 'binding:cleanup',
    target: binding,
    targetId: 11,
    bindingId: 12,
    effectId: 13,
  })
  consumer.consume({
    id: 4,
    timestamp: 4,
    type: 'custom-element:disconnect',
    target: customElement,
    targetId: 10,
    name: 'z-gc-card',
  })
  return {
    customElement: new WeakRefConstructor(customElement),
    binding: new WeakRefConstructor(binding),
  }
}

const targets = createTargets()
let cycles = 0
while (
  cycles < 20 &&
  (targets.customElement.deref() !== undefined ||
    targets.binding.deref() !== undefined)
) {
  cycles += 1
  await new Promise<void>(resolve => setImmediate(resolve))
  collectGarbage()
}

for (let settle = 0; settle < 5; settle += 1) {
  await new Promise<void>(resolve => setImmediate(resolve))
  collectGarbage()
}

const snapshot = consumer.getSnapshot()
assert.equal(targets.customElement.deref(), undefined)
assert.equal(targets.binding.deref(), undefined)
assert.equal(
  snapshot.bindings.find(binding => binding.id === 12)?.target,
  undefined,
)
assert.equal(
  snapshot.timeline.some(entry => 'target' in entry),
  false,
)
assert.equal(snapshot.customElements[0]?.name, 'z-gc-card')

const report = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  gcCycles: cycles,
  customElementReleased: targets.customElement.deref() === undefined,
  bindingReleased: targets.binding.deref() === undefined,
  finalizersObserved: [...finalized].sort(),
  retainedGraph: {
    bindings: snapshot.bindings.length,
    customElements: snapshot.customElements.length,
    timeline: snapshot.timeline.length,
  },
  passed: true,
}
fs.writeFileSync(
  path.join(output, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
)
console.log(
  `DevTools GC retained only primitive graph data (${cycles} forced cycles).`,
)
