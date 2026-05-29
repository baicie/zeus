import { defineElement, ref, render } from '@zeus-js/zeus'

import './styles.css'

type Item = {
  id: number
  label: string
}

const count = ref(0)
const filter = ref('')
const items = ref<Item[]>([
  { id: 1, label: 'Compiler IR' },
  { id: 2, label: 'Runtime DOM' },
  { id: 3, label: 'Web Component' },
])

defineElement(
  'z-status',
  {
    shadow: true,
    props: {
      count: Number,
      open: Boolean,
    },
  },
  props => {
    const wrapper = document.createElement('span')
    wrapper.className = 'wc-status'
    wrapper.textContent = `custom element: count=${props.count}, open=${props.open}`
    return wrapper
  },
)

function CounterPanel() {
  return (
    <section class="panel">
      <div class="panelHeader">
        <div>
          <h2>Counter</h2>
          <p>事件绑定、文本绑定和 property 绑定</p>
        </div>
        <strong>{count.value}</strong>
      </div>
      <div class="actions">
        <button onClick={() => count.value--}>-</button>
        <button onClick={() => count.value++}>+</button>
        <button onClick={() => (count.value = 0)}>Reset</button>
      </div>
      <input
        prop:value={filter.value}
        placeholder="Filter list"
        onInput={event => {
          filter.value = (event.target as HTMLInputElement).value
        }}
      />
    </section>
  )
}

function ListPanel() {
  return (
    <section class="panel">
      <div class="panelHeader">
        <div>
          <h2>For</h2>
          <p>列表区域会根据 signal 重新挂载</p>
        </div>
        <button
          onClick={() => {
            const next = items.value.length + 1
            items.value = [...items.value, { id: next, label: `Item ${next}` }]
          }}
        >
          Add
        </button>
      </div>
      <ul>
        <For
          each={items.value.filter(item => item.label.includes(filter.value))}
        >
          {(item, index) => (
            <li>
              <span>
                {index + 1}. {item.label}
              </span>
              <button
                onClick={() => {
                  items.value = items.value.filter(
                    entry => entry.id !== item.id,
                  )
                }}
              >
                Remove
              </button>
            </li>
          )}
        </For>
      </ul>
    </section>
  )
}

function ConditionalPanel() {
  return (
    <section class="panel">
      <div class="panelHeader">
        <div>
          <h2>Show</h2>
          <p>偶数时显示主分支，否则显示 fallback</p>
        </div>
      </div>
      <Show when={count.value % 2 === 0} fallback="Odd count fallback">
        <p class="stateText">Even count branch</p>
      </Show>
    </section>
  )
}

function WebComponentPanel() {
  return (
    <section class="panel">
      <div class="panelHeader">
        <div>
          <h2>defineElement</h2>
          <p>attribute casting + shadow root</p>
        </div>
      </div>
      <z-status count={count.value} open={count.value % 2 === 0} />
    </section>
  )
}

function App() {
  return (
    <main>
      <header>
        <span>Zeus render demo</span>
        <h1>IR-first DOM rendering</h1>
      </header>
      <div class="grid">
        <CounterPanel />
        <ListPanel />
        <ConditionalPanel />
        <WebComponentPanel />
      </div>
    </main>
  )
}

const root = document.querySelector('#app')

if (!root) {
  throw new Error('Missing #app root')
}

render(App, root)
