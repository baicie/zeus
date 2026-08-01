# Reactivity

## Fine-grained graph

Zeus tracks signal reads made by memos, effects, and compiled DOM bindings.

```txt
createSignal() -> dependency -> binding/effect
                       ^
                 createMemo()
```

```ts
const [count, setCount] = createSignal(0)
const doubled = createMemo(() => count() * 2)

createEffect(() => {
  console.log(doubled())
})
```

## Batch updates

```ts
batch(() => {
  setCount(1)
  setCount(2)
  setCount(3)
})
```

Dependent effects run once with `3` after the outer batch ends.

## Effect cleanup

```ts
createEffect(() => {
  const handler = () => console.log(count())
  document.addEventListener('click', handler)

  onCleanup(() => {
    document.removeEventListener('click', handler)
  })
})
```

Multiple cleanup callbacks are supported and run in registration order.

## Root disposal

```ts
const dispose = createRoot(dispose => {
  createEffect(() => console.log(count()))
  return dispose
})

dispose()
```

`dispose` is idempotent. It stops all owned effects and executes all remaining cleanup.
