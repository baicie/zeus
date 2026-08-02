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

## Internal engine

`@zeus-js/signal/internal` is reserved for Zeus packages. It is not an application interface and has no compatibility guarantees.
