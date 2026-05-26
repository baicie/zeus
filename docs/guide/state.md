# State

Zeus uses `state()` as the unified state API.

## Primitive state

Primitive values are wrapped in a value holder.

```ts
const count = state(0)

count.value++
```

## Object state

Objects are converted into reactive proxies.

```ts
const user = state({
  name: 'Zeus',
  age: 1,
})

user.name = 'ZeusJS'
```

## Arrays

```ts
const todos = state([{ id: 1, title: 'Learn Zeus' }])

todos.push({
  id: 2,
  title: 'Build app',
})
```

## Map / Set

```ts
const map = state(new Map<string, number>())

map.set('a', 1)
```

## Why not ref()?

Zeus reserves `ref` as a JSX attribute protocol:

```tsx
const input = state<HTMLInputElement | null>(null)

<input ref={input} />
```

Use `state()` for state creation.
