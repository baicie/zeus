# Todo

A todo app demonstrating `For`, immutable signal updates, and event binding.

```tsx
import { createSignal, For, render } from '@zeus-js/zeus'

interface Todo {
  id: number
  title: string
  done: boolean
}

function TodoApp() {
  const [todos, setTodos] = createSignal<Todo[]>([])
  const [input, setInput] = createSignal('')

  function addTodo() {
    if (!input().trim()) return

    setTodos(current => [
      ...current,
      { id: Date.now(), title: input(), done: false },
    ])
    setInput('')
  }

  function setDone(id: number, done: boolean) {
    setTodos(current =>
      current.map(todo => (todo.id === id ? { ...todo, done } : todo)),
    )
  }

  return (
    <div>
      <input
        prop:value={input()}
        onInput={event => setInput(event.currentTarget.value)}
      />
      <button onClick={addTodo}>Add</button>

      <ul>
        <For each={todos()}>
          {todo => (
            <li>
              <input
                type="checkbox"
                prop:checked={todo.done}
                onChange={event =>
                  setDone(todo.id, event.currentTarget.checked)
                }
              />
              <span>{todo.title}</span>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}

render(() => <TodoApp />, document.getElementById('root')!)
```

The list is intentionally unkeyed because each immutable update replaces todo objects. Keyed records preserve their existing subtree and are better suited to items whose changing fields are explicit accessors.
