# Todo

A todo app demonstrating For, keyed diff, and object state.

```tsx
import { For, render, Show, state } from '@zeus-js/zeus'

interface Todo {
  id: number
  title: string
  done: boolean
}

function TodoApp() {
  const todos = state<Todo[]>([])
  const input = state('')

  function addTodo() {
    if (!input.value.trim()) return

    todos.push({
      id: Date.now(),
      title: input.value,
      done: false,
    })
    input.value = ''
  }

  return (
    <div>
      <h1>Todo</h1>

      <input
        value={input.value}
        onInput={e => {
          input.value = e.currentTarget.value
        }}
      />
      <button onClick={addTodo}>Add</button>

      <ul>
        <For each={todos} by={todo => todo.id}>
          {todo => (
            <li>
              <input
                type="checkbox"
                checked={todo.done}
                onChange={e => {
                  todo.done = e.currentTarget.checked
                }}
              />
              <span
                style={{ textDecoration: todo.done ? 'line-through' : 'none' }}
              >
                {todo.title}
              </span>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}

render(() => <TodoApp />, document.getElementById('root')!)
```

## Key concepts

- `For` with `by` for keyed list rendering
- Object state with `state<T[]>([])`
- Mutating reactive objects directly
- Checkbox binding with `prop:checked`
