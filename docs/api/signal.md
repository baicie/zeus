# @zeus-js/signal

The public reactivity package exposes the same small contract as `@zeus-js/zeus`.

```ts
import {
  createSignal,
  createMemo,
  createEffect,
  createRoot,
  onCleanup,
  batch,
} from '@zeus-js/signal'
```

| Export         | Description                                     |
| -------------- | ----------------------------------------------- |
| `createSignal` | Create a shallow getter/setter signal           |
| `createMemo`   | Create a cached derived getter                  |
| `createEffect` | Run a dependency-tracked side effect            |
| `createRoot`   | Own effects and cleanup under an explicit root  |
| `onCleanup`    | Register effect or owner cleanup                |
| `batch`        | Flush dependent effects after grouped mutations |

## createSignal

```ts
const [count, setCount] = createSignal(0)

count() // 0
setCount(1)
setCount(previous => previous + 1)
```

Signals are shallow. Replace objects and arrays explicitly:

```ts
const [todos, setTodos] = createSignal<Todo[]>([])

setTodos(current => [...current, nextTodo])
```

## createMemo

```ts
const doubled = createMemo(() => count() * 2)
```

The computation is lazy and cached until one of its dependencies changes.

## createEffect and onCleanup

```ts
createEffect(() => {
  const handler = () => console.log(count())
  window.addEventListener('click', handler)

  onCleanup(() => {
    window.removeEventListener('click', handler)
  })
})
```

Cleanup runs before the effect reruns and when its owner is disposed.

## createRoot

```ts
const dispose = createRoot(dispose => {
  createEffect(() => console.log(count()))
  return dispose
})

dispose()
```

## batch

```ts
batch(() => {
  setCount(1)
  setCount(2)
})
```

Dependent effects flush once with the final value.

## Runtime diagnostics

`@zeus-js/signal/diagnostics` provides opt-in counters for performance tests and
component diagnostics. It is separate from the application entry so normal
application code does not expand the public `@zeus-js/signal` surface.

```ts
import { createRuntimeDiagnosticsSession } from '@zeus-js/signal/diagnostics'

const diagnostics = createRuntimeDiagnosticsSession()

const dispose = diagnostics.run(() =>
  createRoot(dispose => {
    createEffect(() => {})
    return dispose
  }),
)

dispose()
console.log(diagnostics.snapshot())
diagnostics.dispose()
```

The snapshot counts effects, scopes, refs, memos and Proxy cache misses created
under the session. Only effects and scopes have deterministic disposal counts.
Proxy, ref and memo lifetime remains controlled by garbage collection, so the
API does not report synthetic disposal values for them. `allocationsCreated`
and `allocationsDisposed` are aggregates of these runtime-owned categories,
not a measurement of all JavaScript heap allocations.

`run()` is deliberately synchronous: it returns the callback result and rejects
Promise-returning callbacks at the type boundary. Effects and scopes created
during that callback retain their session attribution for later synchronous
runs, but unrelated asynchronous continuations are not implicitly captured.

## Internal engine

`@zeus-js/signal/internal` is reserved for Zeus packages. It is not an application interface and has no compatibility guarantees.
