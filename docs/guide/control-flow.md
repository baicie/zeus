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

With `by`, Zeus reuses the existing DOM subtree and owner scope when an item
moves. Removing an item disposes that item's scope immediately.

The render callback captures the item passed when a key is first mounted.
Replacing that item with a different object that has the same key does not
rerun the callback. Put fields that must change in place behind explicit
accessors, or use unkeyed iteration when replacing whole records.

```tsx
<For each={rows()} by={row => row.id}>
  {row => <li>{row.title()}</li>}
</For>
```

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

This replaces the current list subtree when the collection changes. It is the
straightforward choice for immutable arrays whose records are replaced with
new objects.
