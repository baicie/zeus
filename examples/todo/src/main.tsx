import { For, render, state } from '@zeus-js/zeus'

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

  function removeTodo(id: number) {
    const idx = todos.findIndex(t => t.id === id)
    if (idx !== -1) todos.splice(idx, 1)
  }

  return (
    <div class="container">
      <h1>Todo</h1>

      <div class="input-row">
        <input
          type="text"
          prop:value={input.value}
          onInput={e => {
            input.value = (e.currentTarget as HTMLInputElement).value
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') addTodo()
          }}
        />
        <button class="add" onClick={addTodo}>
          Add
        </button>
      </div>

      <ul>
        <For each={todos} by={todo => todo.id}>
          {todo => (
            <li>
              <input
                type="checkbox"
                prop:checked={todo.done}
                onChange={e => {
                  todo.done = (e.currentTarget as HTMLInputElement).checked
                }}
              />
              <span class={`todo-text${todo.done ? ' done' : ''}`}>
                {todo.title}
              </span>
              <button class="delete" onClick={() => removeTodo(todo.id)}>
                Delete
              </button>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}

render(() => <TodoApp />, document.getElementById('root')!)
