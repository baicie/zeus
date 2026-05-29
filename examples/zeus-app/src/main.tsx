import { For, Show, computed, render, state } from '@zeus-js/zeus'

function App() {
  const count = state(0)

  const user = state({
    name: 'Zeus',
    active: true,
  })

  const todos = state([
    { id: 1, title: 'Phase 1: state API' },
    { id: 2, title: 'Phase 2: runtime-dom' },
    { id: 3, title: 'Phase 3: compiler' },
  ])

  const input = state<HTMLInputElement | null>(null)

  const title = computed(() => {
    return `${user.name}: ${count.value}`
  })

  return (
    <main class={{ active: user.active }} style={{ padding: 16 }}>
      <h1>{title.value}</h1>

      <input
        ref={input}
        prop:value={user.name}
        onInput={event => {
          user.name = event.currentTarget.value
        }}
      />

      <button onClick={() => count.value++}>count: {count.value}</button>

      <Show when={count.value > 0} fallback={<p>empty</p>}>
        <p>count is positive</p>
      </Show>

      <ul>
        <For each={todos}>{todo => <li>{todo.title}</li>}</For>
      </ul>
    </main>
  )
}

const root = document.getElementById('root')!

let dispose = render(() => <App />, root)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    dispose()
  })
}
