# State

Zeus uses explicit getter/setter signals.

## Primitive values

```ts
const [count, setCount] = createSignal(0)

console.log(count())
setCount(count() + 1)
setCount(previous => previous + 1)
```

## Derived values

```ts
const doubled = createMemo(() => count() * 2)
```

## Objects and arrays

Signals are shallow and preserve object identity. Replace values explicitly instead of relying on deep proxy mutation.

```ts
const [user, setUser] = createSignal({ name: 'Zeus', age: 1 })

setUser(current => ({ ...current, name: 'ZeusJS' }))
```

```ts
const [todos, setTodos] = createSignal<Todo[]>([])

setTodos(current => [...current, { id: 1, title: 'Learn Zeus' }])
setTodos(current => current.filter(todo => todo.id !== 1))
```

## Effects and ownership

```ts
createRoot(dispose => {
  createEffect(() => {
    console.log(count())
    onCleanup(() => console.log('effect cleanup'))
  })

  onCleanup(() => console.log('root cleanup'))
  return dispose
})
```

Components rendered by Zeus already run inside an owned root. Use `createRoot` when creating a standalone reactive lifetime outside `render` or `defineElement`.
