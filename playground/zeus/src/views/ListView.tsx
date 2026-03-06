import { computed, signal } from '@zeus-js/core'

const SUBTITLE =
  'Array.prototype.map() over a signal. When the array signal changes, the runtime re-evaluates and patches only the changed list items.'

interface TodoItem {
  id: number
  text: string
  done: boolean
}

let _nextId = 4

// ── Extracted component functions ──

function EmptyList() {
  return <div class="preview-box">No items here. Add one above!</div>
}

interface TodoItemProps {
  todo: TodoItem
  onToggle: () => void
  onRemove: () => void
}

function TodoItemEl(props: TodoItemProps) {
  const textClass = props.todo.done ? 'todo-text done' : 'todo-text'
  return (
    <li class="todo-item">
      <input
        type="checkbox"
        class="todo-check"
        checked={props.todo.done}
        onChange={props.onToggle}
      />
      <span class={textClass}>{props.todo.text}</span>
      <button
        class="btn btn-danger"
        style={{ padding: '.3rem .6rem', fontSize: '.8rem' }}
        onClick={props.onRemove}
      >
        ✕
      </button>
    </li>
  )
}

interface ClearBtnProps {
  onClick: () => void
}

function ClearBtn(props: ClearBtnProps) {
  return (
    <div class="section">
      <button
        class="btn btn-secondary"
        style={{ fontSize: '.8rem' }}
        onClick={props.onClick}
      >
        Clear completed
      </button>
    </div>
  )
}

// ── Main component ──

function ListView() {
  const todos = signal<TodoItem[]>([
    { id: 1, text: 'Learn Zeus reactive signals', done: true },
    { id: 2, text: 'Try list rendering with .map()', done: false },
    { id: 3, text: 'Build something awesome', done: false },
  ])
  const newText = signal('')
  const filterActive = signal(false)

  function addTodo() {
    const text = newText().trim()
    if (!text) return
    todos(todos().concat([{ id: _nextId++, text, done: false }]))
    newText('')
  }

  function removeTodo(id: number) {
    todos(
      todos().filter(function (t) {
        return t.id !== id
      }),
    )
  }

  function toggleTodo(id: number) {
    todos(
      todos().map(function (t) {
        if (t.id !== id) return t
        return { id: t.id, text: t.text, done: !t.done }
      }),
    )
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter') addTodo()
  }

  function clearCompleted() {
    todos(
      todos().filter(function (t) {
        return !t.done
      }),
    )
  }

  // computed() for all complex expressions to keep them reactive
  const visible = computed(function () {
    return filterActive()
      ? todos().filter(function (t) {
          return !t.done
        })
      : todos()
  })
  const doneCount = computed(function () {
    return todos().filter(function (t) {
      return t.done
    }).length
  })
  const totalCount = computed(function () {
    return todos().length
  })
  const activeCount = computed(function () {
    return todos().length - doneCount()
  })
  const hasTodos = computed(function () {
    return todos().length > 0
  })
  const isEmpty = computed(function () {
    return visible().length === 0
  })

  const allBtnClass = computed(function () {
    return filterActive() ? 'btn btn-secondary' : 'btn btn-primary'
  })
  const activeBtnClass = computed(function () {
    return filterActive() ? 'btn btn-primary' : 'btn btn-secondary'
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
            onInput={(e: InputEvent) =>
              newText((e.target as HTMLInputElement).value)
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
          <button class={allBtnClass()} onClick={() => filterActive(false)}>
            All ({totalCount()})
          </button>
          <button class={activeBtnClass()} onClick={() => filterActive(true)}>
            Active ({activeCount()})
          </button>
          <span class="chip chip-green">{doneCount()} done</span>
        </div>
      </div>

      <div class="section">
        <h3>Items</h3>
        {isEmpty() && EmptyList({})}
        <ul class="todo-list">
          {visible().map(function (todo) {
            return TodoItemEl({
              todo,
              onToggle: function () {
                toggleTodo(todo.id)
              },
              onRemove: function () {
                removeTodo(todo.id)
              },
            })
          })}
        </ul>
      </div>

      {hasTodos() && ClearBtn({ onClick: clearCompleted })}
    </div>
  )
}

export default ListView
