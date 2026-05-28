# Control Flow

## Show

Conditional rendering with fallback.

```tsx
import { Show } from '@zeus-js/zeus'

function Greeting({ user }) {
  return (
    <Show when={user} fallback={<p>Please log in</p>}>
      <p>Welcome, {user.name}</p>
    </Show>
  )
}
```

## For

List rendering with keyed diff.

```tsx
import { For } from '@zeus-js/zeus'

function TodoList({ todos }) {
  return (
    <ul>
      <For each={todos} by={todo => todo.id}>
        {todo => (
          <li>
            <span>{todo.title}</span>
          </li>
        )}
      </For>
    </ul>
  )
}
```

The `by` prop enables DOM reuse when items are reordered.

### Keyed diff behavior

With `by`, Zeus reuses existing DOM nodes when items are moved, added, or removed. Items should be reactive objects.

```ts
// Recommended: mutate reactive properties
todo.done = true
```

Replacing an item with a new plain object using the same key may reuse the old DOM subtree. If you need full replacement behavior, change the key or mutate the reactive item directly.

## Index iteration

Without `by`, items are identified by index:

```tsx
<For each={items}>
  {(item, index) => (
    <li>
      {index}: {item}
    </li>
  )}
</For>
```

This does a full replacement on changes (no keyed diff).
