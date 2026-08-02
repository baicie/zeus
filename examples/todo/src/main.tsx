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
      {
        id: Date.now(),
        title: input(),
        done: false,
      },
    ])
    setInput('')
  }

  function removeTodo(id: number) {
    setTodos(current => current.filter(todo => todo.id !== id))
  }

  function setTodoDone(id: number, done: boolean) {
    setTodos(current =>
      current.map(todo => (todo.id === id ? { ...todo, done } : todo)),
    )
  }

  return (
    <div class="container">
      <h1>Todo</h1>

      <div class="input-row">
        <input
          type="text"
          prop:value={input()}
          onInput={e => {
            setInput((e.currentTarget as HTMLInputElement).value)
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
        <For each={todos()}>
          {todo => (
            <li>
              <input
                type="checkbox"
                prop:checked={todo.done}
                onChange={e => {
                  setTodoDone(
                    todo.id,
                    (e.currentTarget as HTMLInputElement).checked,
                  )
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
