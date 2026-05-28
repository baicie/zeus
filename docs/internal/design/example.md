下面给你一个 **复杂 example：`examples/project-board`** 的完整设计与代码草案。

这个 example 用来压测 Zeus 当前 MVP 能力：

```txt
1. state() primitive + object + array
2. computed()
3. Show / For
4. Context：createContext / useContext / Provider
5. Web Component：defineElement / Host / Slot / consumes
6. Context bridge：Provider bridge -> Web Component consumes
7. 表单绑定：prop:value / prop:checked
8. 事件委托：onInput / onClick / onSubmit
9. keyed For：任务列表复用
10. 自定义事件：ctx.emit()
```

当前 `@zeus-js/zeus` 主入口已经导出了 `state / computed / effect / watch / scope / batch / untrack / nextTick / onCleanup`，runtime 侧导出了 `render / Show / For / Host / Slot / defineElement`，并且主入口也导出了 `createContext / useContext / provide / inject`，所以这个 example 可以只从 `@zeus-js/zeus` 引入用户 API。

> **注意**：以下代码草案为设计参考，`src/main.tsx` 中的实际代码可能因编译器自动补全而略有差异（如泛型参数、类型断言）。以 `examples/project-board/src/main.tsx` 为准。

---

# Example 名称

```txt
examples/project-board
```

定位：

```txt
一个迷你项目管理看板：
- 左侧是任务列表
- 顶部有搜索、状态筛选、统计
- 可以新增任务
- 可以切换完成状态
- 可以选择任务
- 右侧详情面板使用 Web Component 实现
- Web Component 通过 Context bridge 读取 Zeus Context
```

---

# 目录结构

```txt
examples/project-board/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    style.css
```

---

# 1. `package.json`

```json
{
  "name": "@zeus-js/example-project-board",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@zeus-js/zeus": "workspace:*"
  },
  "devDependencies": {
    "@zeus-js/vite-plugin": "workspace:*",
    "typescript": "^6.0.3",
    "vite": "catalog:"
  }
}
```

---

# 2. `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
```

---

# 3. `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "jsxImportSource": "@zeus-js/zeus",
    "types": ["@zeus-js/zeus/jsx"],
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

---

# 4. `index.html`

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Zeus Project Board</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

# 5. `src/main.tsx`

```tsx
import {
  For,
  Host,
  Show,
  Slot,
  computed,
  createContext,
  defineElement,
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
 * - 通过 ctx.emit 派发 close 事件
 */
defineElement<{ open: boolean }>(
  'z-task-inspector',
  {
    shadow: false,
    consumes: [BoardContext],
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
                ctx.emit('close')
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
```

---

# 6. `src/style.css`

```css
:root {
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  color: #111;
  background: #f5f5f5;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 20px;
  padding: 24px;
}

.board {
  display: grid;
  gap: 16px;
  align-content: start;
}

.board-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: end;
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #666;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0;
  font-size: 40px;
  letter-spacing: -0.04em;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 96px);
  gap: 8px;
}

.stat-card,
.composer,
.filters,
.task-item,
.inspector {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 18px;
  box-shadow: 0 8px 30px rgb(0 0 0 / 4%);
}

.stat-card {
  padding: 12px;
}

.stat-card span {
  display: block;
  font-size: 12px;
  color: #666;
}

.stat-card strong {
  display: block;
  margin-top: 4px;
  font-size: 24px;
}

.composer {
  padding: 16px;
  display: grid;
  gap: 12px;
}

.field {
  display: grid;
  gap: 6px;
}

.field label {
  font-size: 13px;
  color: #555;
}

input,
textarea,
select {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
}

textarea {
  min-height: 72px;
  resize: vertical;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-row input,
.task-check input {
  width: auto;
}

.composer button,
.detail-actions button {
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  background: #111;
  color: #fff;
}

.filters {
  padding: 12px;
  display: grid;
  grid-template-columns: 1fr 160px;
  gap: 12px;
}

.task-list {
  display: grid;
  gap: 10px;
}

.task-item {
  padding: 14px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.task-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 35px rgb(0 0 0 / 7%);
}

.task-item.selected {
  border-color: #111;
}

.task-item.done {
  opacity: 0.65;
}

.task-item.urgent {
  border-style: dashed;
}

.task-main {
  display: flex;
  gap: 12px;
  min-width: 0;
}

.task-main h3 {
  margin-bottom: 4px;
}

.task-main p {
  margin-bottom: 0;
  color: #666;
  line-height: 1.5;
}

.task-meta {
  display: flex;
  align-items: start;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.status,
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid #ddd;
}

.status-todo {
  background: #fafafa;
}

.status-doing {
  background: #fff7e6;
  border-color: #f0d7a0;
}

.status-done {
  background: #ebf8ef;
  border-color: #b7e0c2;
}

.badge.urgent {
  background: #111;
  color: #fff;
  border-color: #111;
}

.empty-state,
.empty-inspector {
  padding: 28px;
  text-align: center;
  color: #666;
  background: #fff;
  border: 1px dashed #ccc;
  border-radius: 18px;
}

.inspector {
  position: sticky;
  top: 24px;
  align-self: start;
  min-height: calc(100vh - 48px);
  padding: 16px;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 16px;
}

.inspector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ghost-button {
  border: 1px solid #ddd;
  border-radius: 10px;
  background: #fff;
  width: 32px;
  height: 32px;
}

.task-detail {
  display: grid;
  gap: 16px;
}

.detail-title-row {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.task-detail p {
  color: #555;
  line-height: 1.6;
}

.task-detail dl {
  display: grid;
  gap: 8px;
  margin: 0;
}

.task-detail dl div {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid #eee;
  padding-bottom: 8px;
}

.task-detail dt {
  color: #666;
}

.task-detail dd {
  margin: 0;
  font-weight: 600;
}

.detail-actions {
  display: flex;
  gap: 8px;
}

.detail-actions .danger-button {
  background: #fff;
  color: #a40000;
  border: 1px solid #e6b8b8;
}

@media (max-width: 900px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .inspector {
    position: static;
    min-height: auto;
  }

  .board-header {
    display: grid;
  }

  .stats-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

---

# 为什么这个 example 值得加

它比现有 counter/todo 更能暴露框架问题：

```txt
1. 如果 compiler children 不是 lazy，Context Provider 会失效
2. 如果 Provider bridge 有问题，Web Component 读不到 Context
3. 如果 prop:value / prop:checked 有问题，表单会异常
4. 如果 event.currentTarget 有问题，input/select 会异常
5. 如果 For keyed 有问题，列表移动/删除会异常
6. 如果 Show 清理有问题，empty state / detail panel 会残留
7. 如果 class object binding 有问题，selected/done/urgent 样式会异常
```

---

# 建议加入根检查脚本

把它加进 `scripts/check-examples.ts`：

```ts
const examples = [
  '@zeus-js/example-counter',
  '@zeus-js/example-todo',
  '@zeus-js/example-web-component',
  '@zeus-js/example-project-board',
]
```

---

# 建议 docs 增加说明

新增：

```txt
docs/examples/project-board.md
```

内容可以写：

```md
# Project Board

This example demonstrates a complex Zeus app using:

- `state()`
- `computed()`
- `Show`
- `For`
- `createContext()`
- Web Components with `defineElement()`
- Context bridge
- `prop:value` and `prop:checked`
```

---

# 验收标准

```bash
pnpm -F @zeus-js/example-project-board check
pnpm -F @zeus-js/example-project-board build
```

浏览器中验证：

```txt
1. 输入 title + description 可以新增任务
2. 勾选 urgent 后新增任务有 Urgent badge
3. 搜索可以过滤任务
4. status select 可以过滤 todo/doing/done
5. 点击任务，右侧 Web Component inspector 显示详情
6. inspector 中 Mark done / Reopen 可以更新任务
7. Delete 可以删除任务
8. 右侧 close 按钮可以关闭详情
9. progress 统计会跟随 done 数量更新
```

这个 example 可以作为 Zeus 的 **复杂 MVP showcase**。它的价值不是 UI 多复杂，而是把你现在已经做完的核心能力串成一个真实应用闭环。
