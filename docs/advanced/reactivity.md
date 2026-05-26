# Reactivity

## Fine-grained reactivity

Zeus tracks dependencies at the property level. Only the properties you read are tracked.

```ts
const user = state({ name: 'Zeus', age: 1 })

effect(() => {
  // Only tracks user.name, not user.age
  console.log(user.name)
})
```

## Signal graph

```
state() → dep → effect
         ↑
     computed()
```

## Batch updates

```ts
batch(() => {
  count.value++
  count.value++
  count.value++
})
// Effect runs once, not three times
```

## Untrack

Read without subscribing to changes:

```ts
const id = untrack(() => user.id)
```

## Scheduler

`queueJob` defers updates to the next microtask:

```ts
effect(() => {
  queueJob(() => {
    // Runs in the next microtask
  })
})
```

## Effect cleanup

Effects can register cleanup functions:

```ts
effect(() => {
  const handler = () => console.log('clicked')
  document.addEventListener('click', handler)

  onCleanup(() => {
    document.removeEventListener('click', handler)
  })
})
```
