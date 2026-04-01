import { createMemo, createSignal, For, Show } from 'solid-js'
import type { RouteSectionProps } from '@solidjs/router'

const SUBTITLE =
  '<For> component iterates over a reactive array. When the array changes, SolidJS surgically updates only the affected DOM nodes.'

interface TodoItem {
  id: number
  text: string
  done: boolean
}

let _nextId = 4

interface TodoItemProps {
  todo: TodoItem
  onToggle: () => void
  onRemove: () => void
}

function TodoItem(props: TodoItemProps) {
  return (
    <li class="todo-item">
      <input
        type="checkbox"
        class="todo-check"
        checked={props.todo.done}
        onChange={props.onToggle}
      />
      <span class={`todo-text ${props.todo.done ? 'done' : ''}`}>
        {props.todo.text}
      </span>
      <button
        class="btn btn-danger"
        style={{ padding: '.3rem .6rem', 'font-size': '.8rem' }}
        onClick={props.onRemove}
      >
        ✕
      </button>
    </li>
  )
}

function ListView(_props: RouteSectionProps) {
  const [todos, setTodos] = createSignal<TodoItem[]>([
    { id: 1, text: 'Learn SolidJS reactive signals', done: true },
    { id: 2, text: 'Try list rendering with <For>', done: false },
    { id: 3, text: 'Build something awesome', done: false },
  ])
  const [newText, setNewText] = createSignal('')
  const [filterActive, setFilterActive] = createSignal(false)

  function addTodo() {
    const text = newText().trim()
    if (!text) return
    setTodos(prev => [...prev, { id: _nextId++, text, done: false }])
    setNewText('')
  }

  function removeTodo(id: number) {
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  function toggleTodo(id: number) {
    setTodos(prev =>
      prev.map(t => (t.id !== id ? t : { ...t, done: !t.done }))
    )
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter') addTodo()
  }

  function clearCompleted() {
    setTodos(prev => prev.filter(t => !t.done))
  }

  const visible = createMemo(() => {
    return filterActive()
      ? todos().filter(t => !t.done)
      : todos()
  })

  const doneCount = createMemo(() => {
    return todos().filter(t => t.done).length
  })

  const totalCount = createMemo(() => {
    return todos().length
  })

  const activeCount = createMemo(() => {
    return todos().length - doneCount()
  })

  const hasTodos = createMemo(() => {
    return todos().length > 0
  })

  const isEmpty = createMemo(() => {
    return visible().length === 0
  })

  return (
    <div class="demo-card">
      <h2>📋 List Rendering</h2>
      <p class="subtitle">{SUBTITLE}</p>

      <div class="section">
        <h3>Add Item</h3>
        <div class="input-row">
          <input
            placeholder="What needs to be done?"
            value={newText()}
            onInput={(e: InputEvent) =>
              setNewText((e.target as HTMLInputElement).value)
            }
            onKeyDown={handleKey}
          />
          <button class="btn btn-primary" onClick={addTodo}>
            Add
          </button>
        </div>
      </div>

      <div class="section">
        <h3>Filter</h3>
        <div class="btn-group">
          <button
            class={`btn ${!filterActive() ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterActive(false)}
          >
            All ({totalCount()})
          </button>
          <button
            class={`btn ${filterActive() ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterActive(true)}
          >
            Active ({activeCount()})
          </button>
          <span class="chip chip-green">{doneCount()} done</span>
        </div>
      </div>

      <div class="section">
        <h3>Items</h3>
        <Show when={!isEmpty()} fallback={<div class="preview-box">No items here. Add one above!</div>}>
          <ul class="todo-list">
            <For each={visible()}>
              {todo => (
                <TodoItem
                  todo={todo}
                  onToggle={() => toggleTodo(todo.id)}
                  onRemove={() => removeTodo(todo.id)}
                />
              )}
            </For>
          </ul>
        </Show>
      </div>

      <Show when={hasTodos()}>
        <div class="section">
          <button
            class="btn btn-secondary"
            style={{ 'font-size': '.8rem' }}
            onClick={clearCompleted}
          >
            Clear completed
          </button>
        </div>
      </Show>
    </div>
  )
}

export default ListView
