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
