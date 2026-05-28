# @zeus-js/signal

Reactivity core package for Zeus.

## Recommended

Zeus applications should use these APIs:

```ts
import { state, computed, effect, watch, scope, batch, untrack, nextTick, onCleanup } from '@zeus-js/signal'
```

| Export | Description |
| --- | --- |
| `state` | Unified reactive state (primitives, objects, arrays, Map, Set) |
| `computed` | Derived reactive value |
| `effect` | Reactive side effect |
| `watch` | Watcher with callback |
| `scope` | Isolated reactive scope |
| `batch` | Batch reactive updates |
| `untrack` | Read without tracking dependencies |
| `nextTick` | Promise-based microtask scheduling |
| `onCleanup` | Register cleanup callbacks |

## state

```ts
function state<T>(value: T): T
```

Unified state API. Works with primitives, objects, arrays, Map, Set.

```ts
const count = state(0)
const user = state({ name: 'Zeus' })
const items = state([1, 2, 3])
```

## computed

```ts
function computed<T>(fn: () => T): ComputedRef<T>
```

Creates a derived reactive value.

```ts
const doubled = computed(() => count.value * 2)
```

## effect

```ts
function effect(fn: () => void): StopFn
```

Runs `fn` reactively and tracks its dependencies.

```ts
effect(() => {
  console.log('count:', count.value)
})
```

## watch

```ts
function watch<T>(
  getter: () => T,
  callback: (newValue: T, oldValue: T) => void,
): void
```

Watches a reactive value and calls the callback when it changes.

```ts
watch(count, (newVal, oldVal) => {
  console.log(`${oldVal} -> ${newVal}`)
})
```

## scope

```ts
function scope(): Scope
```

Creates an isolated reactive scope. Call `scope.stop()` to dispose all reactive state within.

## batch

```ts
function batch<T>(fn: () => T): T
```

Groups reactive updates to avoid redundant effect runs.

## untrack

```ts
function untrack<T>(fn: () => T): T
```

Reads reactive values without tracking dependencies.
