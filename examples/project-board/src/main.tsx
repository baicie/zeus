import {
  For,
  Host,
  Show,
  Slot,
  computed,
  createContext,
  defineElement,
  event,
  render,
  state,
  useContext,
} from '@zeus-js/zeus'

import './style.css'

type TaskStatus = 'todo' | 'doing' | 'done'

type Task = {
  id: number
  title: string
  description: string
  status: TaskStatus
  urgent: boolean
}

type BoardStore = {
  tasks: Task[]
  keyword: { value: string }
  statusFilter: { value: 'all' | TaskStatus }
  selectedTaskId: { value: number | null }

  filteredTasks: { readonly value: Task[] }
  selectedTask: { readonly value: Task | undefined }
  total: { readonly value: number }
  doneCount: { readonly value: number }
  progress: { readonly value: number }

  addTask: (input: NewTaskInput) => void
  selectTask: (id: number) => void
  closeInspector: () => void
  toggleDone: (task: Task) => void
  removeTask: (id: number) => void
}

type NewTaskInput = {
  title: string
  description: string
  urgent: boolean
}

type TaskInspectorEmits = {
  close: ReturnType<typeof event<void>>
}

const BoardContext = createContext<BoardStore>()

function createBoardStore(): BoardStore {
  const tasks = state<Task[]>([
    {
      id: 1,
      title: 'Finish compiler physical DOM path',
      description:
        'Use firstChild / nextSibling / childNodes to avoid marker lookup.',
      status: 'done',
      urgent: true,
    },
    {
      id: 2,
      title: 'Add runtime cleanup tests',
      description:
        'Cover render dispose, event cleanup, For cleanup and ref cleanup.',
      status: 'doing',
      urgent: false,
    },
    {
      id: 3,
      title: 'Prepare alpha release',
      description: 'Run release precheck and publish core packages as alpha.',
      status: 'todo',
      urgent: false,
    },
  ])

  const keyword = state('')
  const statusFilter = state<'all' | TaskStatus>('all')
  const selectedTaskId = state<number | null>(null)

  const filteredTasks = computed(() => {
    const query = keyword.value.trim().toLowerCase()

    return tasks.filter(task => {
      const matchesKeyword =
        !query ||
        task.title.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query)

      const matchesStatus =
        statusFilter.value === 'all' || task.status === statusFilter.value

      return matchesKeyword && matchesStatus
    })
  })

  const selectedTask = computed(() => {
    if (selectedTaskId.value == null) return undefined

    return tasks.find(task => task.id === selectedTaskId.value)
  })

  const total = computed(() => tasks.length)

  const doneCount = computed(() => {
    return tasks.filter(task => task.status === 'done').length
  })

  const progress = computed(() => {
    if (total.value === 0) return 0
    return Math.round((doneCount.value / total.value) * 100)
  })

  function addTask(input: NewTaskInput) {
    const title = input.title.trim()
    const description = input.description.trim()

    if (!title) return

    tasks.unshift({
      id: Date.now(),
      title,
      description: description || 'No description.',
      status: 'todo',
      urgent: input.urgent,
    })
  }

  function selectTask(id: number) {
    selectedTaskId.value = id
  }

  function closeInspector() {
    selectedTaskId.value = null
  }

  function toggleDone(task: Task) {
    task.status = task.status === 'done' ? 'todo' : 'done'
  }

  function removeTask(id: number) {
    const index = tasks.findIndex(task => task.id === id)

    if (index >= 0) {
      tasks.splice(index, 1)
    }

    if (selectedTaskId.value === id) {
      selectedTaskId.value = null
    }
  }

  return {
    tasks,
    keyword,
    statusFilter,
    selectedTaskId,

    filteredTasks,
    selectedTask,
    total,
    doneCount,
    progress,

    addTask,
    selectTask,
    closeInspector,
    toggleDone,
    removeTask,
  }
}

/**
 * Web Component:
 * - 独立 render root
 * - 通过 consumes + Provider bridge 消费 BoardContext
 * - 使用 Host / Slot
 * - 通过声明式 emit 派发 close 事件
 */
defineElement<{ open: boolean }, HTMLElement, TaskInspectorEmits>(
  'z-task-inspector',
  {
    shadow: false,
    consumes: [BoardContext],
    emits: {
      close: event<void>(),
    },
    props: {
      open: Boolean,
    },
  },
  (props, ctx) => {
    const store = useContext(BoardContext)

    return (
      <Host>
        <aside class={{ inspector: true, open: props.open }}>
          <header class="inspector-header">
            <strong>Task Inspector</strong>

            <button
              class="ghost-button"
              onClick={() => {
                store.closeInspector()
                ctx.emit.close()
              }}
            >
              ×
            </button>
          </header>

          <Show
            when={store.selectedTask.value}
            fallback={
              <section class="empty-inspector">
                <Slot>
                  <p>Select a task to inspect details.</p>
                </Slot>
              </section>
            }
          >
            <TaskDetail />
          </Show>
        </aside>
      </Host>
    )
  },
)

function TaskDetail() {
  const store = useContext(BoardContext)
  const task = store.selectedTask.value

  if (!task) {
    return null
  }

  return (
    <section class="task-detail">
      <div class="detail-title-row">
        <h2>{task.title}</h2>

        <span class={{ badge: true, urgent: task.urgent }}>
          {task.urgent ? 'Urgent' : 'Normal'}
        </span>
      </div>

      <p>{task.description}</p>

      <dl>
        <div>
          <dt>Status</dt>
          <dd>{task.status}</dd>
        </div>

        <div>
          <dt>ID</dt>
          <dd>{task.id}</dd>
        </div>
      </dl>

      <div class="detail-actions">
        <button
          onClick={() => {
            store.toggleDone(task)
          }}
        >
          {task.status === 'done' ? 'Reopen' : 'Mark done'}
        </button>

        <button
          class="danger-button"
          onClick={() => {
            store.removeTask(task.id)
          }}
        >
          Delete
        </button>
      </div>
    </section>
  )
}

function App() {
  const store = createBoardStore()

  return (
    <BoardContext.Provider value={store} bridge>
      <main class="app-shell">
        <section class="board">
          <BoardHeader />
          <TaskComposer />
          <TaskFilters />
          <TaskList />
        </section>

        <z-task-inspector
          prop:open={Boolean(store.selectedTask.value)}
          onClose={() => {
            store.closeInspector()
          }}
        >
          <p>No task selected.</p>
        </z-task-inspector>
      </main>
    </BoardContext.Provider>
  )
}

function BoardHeader() {
  const store = useContext(BoardContext)

  return (
    <header class="board-header">
      <div>
        <p class="eyebrow">Zeus complex example</p>
        <h1>Project Board</h1>
      </div>

      <section class="stats-grid">
        <StatCard label="Total" value={store.total.value} />
        <StatCard label="Done" value={store.doneCount.value} />
        <StatCard label="Progress" value={`${store.progress.value}%`} />
      </section>
    </header>
  )
}

function StatCard(props: { label: string; value: string | number }) {
  return (
    <article class="stat-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  )
}

function TaskComposer() {
  const store = useContext(BoardContext)

  const title = state('')
  const description = state('')
  const urgent = state(false)

  function submit(event: Event) {
    event.preventDefault()

    store.addTask({
      title: title.value,
      description: description.value,
      urgent: urgent.value,
    })

    title.value = ''
    description.value = ''
    urgent.value = false
  }

  return (
    <form class="composer" onSubmit={submit}>
      <div class="field">
        <label>Title</label>
        <input
          prop:value={title.value}
          placeholder="Add a task..."
          onInput={event => {
            title.value = (event.currentTarget as HTMLInputElement).value
          }}
        />
      </div>

      <div class="field">
        <label>Description</label>
        <textarea
          prop:value={description.value}
          placeholder="Describe the task..."
          onInput={event => {
            description.value = (
              event.currentTarget as HTMLTextAreaElement
            ).value
          }}
        />
      </div>

      <label class="checkbox-row">
        <input
          type="checkbox"
          prop:checked={urgent.value}
          onChange={event => {
            urgent.value = (event.currentTarget as HTMLInputElement).checked
          }}
        />
        Urgent
      </label>

      <button type="submit">Add task</button>
    </form>
  )
}

function TaskFilters() {
  const store = useContext(BoardContext)

  return (
    <section class="filters">
      <input
        class="search-input"
        prop:value={store.keyword.value}
        placeholder="Search tasks..."
        onInput={event => {
          store.keyword.value = (event.currentTarget as HTMLInputElement).value
        }}
      />

      <select
        prop:value={store.statusFilter.value}
        onChange={event => {
          store.statusFilter.value = (event.currentTarget as HTMLSelectElement)
            .value as 'all' | TaskStatus
        }}
      >
        <option value="all">All</option>
        <option value="todo">Todo</option>
        <option value="doing">Doing</option>
        <option value="done">Done</option>
      </select>
    </section>
  )
}

function TaskList() {
  const store = useContext(BoardContext)

  return (
    <section class="task-list">
      <Show
        when={store.filteredTasks.value.length > 0}
        fallback={
          <div class="empty-state">
            <strong>No tasks found</strong>
            <p>Try changing the filter or create a new task.</p>
          </div>
        }
      >
        <For each={store.filteredTasks.value} by={task => task.id}>
          {(task: Task) => <TaskItem task={task} />}
        </For>
      </Show>
    </section>
  )
}

function TaskItem(props: { task: Task }) {
  const store = useContext(BoardContext)
  const task = props.task

  return (
    <article
      class={{
        'task-item': true,
        selected: store.selectedTaskId.value === task.id,
        done: task.status === 'done',
        urgent: task.urgent,
      }}
      onClick={() => {
        store.selectTask(task.id)
      }}
    >
      <div class="task-main">
        <label
          class="task-check"
          onClick={event => {
            event.stopPropagation()
          }}
        >
          <input
            type="checkbox"
            prop:checked={task.status === 'done'}
            onChange={() => {
              store.toggleDone(task)
            }}
          />
        </label>

        <div>
          <h3>{task.title}</h3>
          <p>{task.description}</p>
        </div>
      </div>

      <div class="task-meta">
        <span class={`status status-${task.status}`}>{task.status}</span>

        <Show when={task.urgent}>
          <span class="badge urgent">Urgent</span>
        </Show>
      </div>
    </article>
  )
}

render(() => <App />, document.getElementById('root')!)
