import type { PlaygroundProduct } from '../products'
import { templates } from '../webc-project'
import type { PlaygroundExample } from './model'

const nativeHello = `import { render } from '@zeus-js/zeus'

render(
  () => (
    <main>
      <p class="eyebrow">Your first Zeus app</p>
      <h1>Hello, Zeus.</h1>
      <p>Edit this file and the preview updates automatically.</p>
      <button onClick={() => alert('Signals make this interactive.')}>
        Try a signal
      </button>
    </main>
  ),
  document.querySelector('#root')!,
)
`

const nativeCounter = `import { createSignal, render } from '@zeus-js/zeus'

const [count, setCount] = createSignal(0)
const [step, setStep] = createSignal(1)

render(
  () => (
    <main>
      <p class="eyebrow">Signals</p>
      <h1>Counter</h1>
      <p>Count: {count()}</p>
      <button onClick={() => setCount(count() + step())}>Add {step()}</button>
      <button onClick={() => setStep(step() + 1)}>Increase step</button>
    </main>
  ),
  document.querySelector('#root')!,
)
`

const nativeLists = `import { For, Show, createSignal, render } from '@zeus-js/zeus'

const [visible, setVisible] = createSignal(true)
const [items, setItems] = createSignal(['Alpha', 'Beta', 'Gamma'])

render(
  () => (
    <main>
      <p class="eyebrow">Control flow</p>
      <h1>Show + For</h1>
      <button onClick={() => setVisible(!visible())}>
        {visible() ? 'Hide list' : 'Show list'}
      </button>
      <Show when={visible()} fallback={<p>Nothing to see here.</p>}>
        <ul>
          <For each={items()}>
            {item => <li>{item}</li>}
          </For>
        </ul>
      </Show>
      <button onClick={() => setItems([...items(), 'Delta'])}>Add item</button>
    </main>
  ),
  document.querySelector('#root')!,
)
`

const nativePropsMain = `import { render } from '@zeus-js/zeus'
import { Greeting } from './greeting'

render(
  () => (
    <main>
      <p class="eyebrow">Components</p>
      <h1>Props</h1>
      <Greeting name="Ada" />
      <Greeting name="Grace" count={2} />
    </main>
  ),
  document.querySelector('#root')!,
)

`

const nativePropsGreeting = `import { Show } from '@zeus-js/zeus'

export interface GreetingProps {
  name: string
  count?: number
}

export const Greeting = (props: GreetingProps) => (
  <section>
    <h2>Hello, {props.name}</h2>
    <Show when={props.count !== undefined}>
      <p>You have {props.count} new messages.</p>
    </Show>
  </section>
)
`

const nativeTodo = `import { For, createSignal, render } from '@zeus-js/zeus'

interface Todo {
  id: number
  text: string
  done: boolean
}

const [todos, setTodos] = createSignal<Todo[]>([])
const [draft, setDraft] = createSignal('')
let nextId = 1

function addTodo() {
  const text = draft().trim()
  if (!text) return
  setTodos([...todos(), { id: nextId++, text, done: false }])
  setDraft('')
}

render(
  () => (
    <main>
      <p class="eyebrow">Forms + lists</p>
      <h1>Todo list</h1>
      <input
        value={draft()}
        placeholder="What needs doing?"
        onInput={event => setDraft(event.currentTarget.value)}
        onKeyDown={event => { if (event.key === 'Enter') addTodo() }}
      />
      <button onClick={addTodo}>Add todo</button>
      <ul>
        <For each={todos()}>
          {todo => (
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => setTodos(todos().map(item => item.id === todo.id ? { ...item, done: !item.done } : item))}
                />
                {todo.text}
              </label>
            </li>
          )}
        </For>
      </ul>
    </main>
  ),
  document.querySelector('#root')!,
)
`

const nativeLifecycle = `import { createEffect, createSignal, onCleanup, render } from '@zeus-js/zeus'

const [count, setCount] = createSignal(0)

createEffect(() => {
  const value = count()
  console.log('count is now', value)
  const timer = window.setTimeout(() => console.info('tick', value), 300)
  onCleanup(() => window.clearTimeout(timer))
})

const [mounted, setMounted] = createSignal(true)
render(
  () => (
    <main>
      <p class="eyebrow">Lifecycle</p>
      <h1>Effects + cleanup</h1>
      <button onClick={() => setCount(count() + 1)}>Increment ({count()})</button>
      <button onClick={() => setMounted(false)}>Hide effect status</button>
      <p>{mounted() ? 'Effect logs every count change.' : 'Status hidden.'}</p>
    </main>
  ),
  document.querySelector('#root')!,
)
`

const webcBadge = `import { defineElement, Host, render } from '@zeus-js/zeus'

export const ZBadge = defineElement(
  'z-badge',
  { shadow: false },
  () => (
    <Host>
      <span class="badge">Custom element</span>
    </Host>
  ),
)

render(
  () => (
    <main>
      <p class="eyebrow">Web Components</p>
      <h1>Basic element</h1>
      <z-badge />
      <p>This tag is a real custom element defined by Zeus.</p>
    </main>
  ),
  document.querySelector('#root')!,
)
`

const webcPropsEvents = `import { createSignal, defineElement, event, Host } from '@zeus-js/zeus'

export const ZStepper = defineElement(
  'z-stepper',
  {
    shadow: false,
    props: { label: String, value: Number },
    emits: { change: event<number>() },
  },
  (props, { emit }) => {
    const [value, setValue] = createSignal(props.value ?? 0)
    return (
      <Host>
        <button
          onClick={() => {
            const next = value() + 1
            setValue(next)
            emit('change', next)
          }}
        >
          {props.label ?? 'Step'}: {value()}
        </button>
      </Host>
    )
  },
)
`

const webcPropsEntry = `import { render } from '@zeus-js/zeus'
import './stepper'

render(
  () => (
    <main>
      <p class="eyebrow">Props + events</p>
      <h1>Custom element API</h1>
      <z-stepper label="Count" value={0} onChange={() => console.log('stepper changed')} />
    </main>
  ),
  document.querySelector('#root')!,
)
`

const webcShadow = `import { createSignal, defineElement, Host } from '@zeus-js/zeus'

export const ZShadowCounter = defineElement(
  'z-shadow-counter',
  {
    shadow: true,
    styles: ':host { display: block; } button { border-radius: 999px; }',
  },
  () => {
    const [count, setCount] = createSignal(0)
    return (
      <Host>
        <button onClick={() => setCount(count() + 1)}>
          Shadow count: {count()}
        </button>
      </Host>
    )
  },
)
`

const webcShadowEntry = `import { render } from '@zeus-js/zeus'
import './shadow-counter'

render(
  () => (
    <main>
      <p class="eyebrow">Encapsulation</p>
      <h1>Shadow DOM</h1>
      <z-shadow-counter />
      <p>The element owns an isolated shadow root.</p>
    </main>
  ),
  document.querySelector('#root')!,
)
`

const webcSlots = `import { defineElement, Host, Slot } from '@zeus-js/zeus'

export const ZPanel = defineElement(
  'z-panel',
  { shadow: false },
  () => (
    <Host>
      <article class="panel">
        <header><Slot name="header" /></header>
        <Slot />
      </article>
    </Host>
  ),
)
`

const webcSlotsEntry = `import { render } from '@zeus-js/zeus'
import './panel'

render(
  () => (
    <main>
      <p class="eyebrow">Composition</p>
      <h1>Slots</h1>
      <z-panel>
        <strong slot="header">Projected header</strong>
        <p>Default slot content.</p>
      </z-panel>
    </main>
  ),
  document.querySelector('#root')!,
)
`

export const examples: readonly PlaygroundExample[] = [
  {
    id: 'native-hello',
    product: 'native-lab',
    title: 'Hello Zeus',
    description: 'Minimal Native app with a render call and JSX.',
    files: [{ path: 'src/main.tsx', content: nativeHello }],
  },
  {
    id: 'native-counter',
    product: 'native-lab',
    title: 'Signals Counter',
    description: 'Signals, derived state and event handlers.',
    files: [{ path: 'src/main.tsx', content: nativeCounter }],
  },
  {
    id: 'native-show-for',
    product: 'native-lab',
    title: 'Show + For',
    description: 'Conditional rendering and keyed list updates.',
    files: [{ path: 'src/main.tsx', content: nativeLists }],
  },
  {
    id: 'native-props',
    product: 'native-lab',
    title: 'Component Props',
    description: 'A small component tree with typed props.',
    files: [
      { path: 'src/main.tsx', content: nativePropsMain },
      { path: 'src/greeting.tsx', content: nativePropsGreeting },
    ],
  },
  {
    id: 'native-todo',
    product: 'native-lab',
    title: 'Todo List',
    description: 'Forms, local state and list interactions.',
    files: [{ path: 'src/main.tsx', content: nativeTodo }],
  },
  {
    id: 'native-lifecycle',
    product: 'native-lab',
    title: 'Lifecycle + Cleanup',
    description: 'Effects, cleanup and disposal.',
    files: [{ path: 'src/main.tsx', content: nativeLifecycle }],
  },
  {
    id: 'native-router-query',
    product: 'native-lab',
    title: 'Router + Query',
    description: 'The full Native Lab reference project.',
    files: templates['native-lab'].files,
  },
  {
    id: 'webc-basic',
    product: 'webc-studio',
    title: 'Basic Custom Element',
    description: 'Define a real custom element in one file.',
    files: [{ path: 'src/main.tsx', content: webcBadge }],
  },
  {
    id: 'webc-counter-slots',
    product: 'webc-studio',
    title: 'Counter + Slots',
    description: 'The WebC Studio reference project.',
    files: templates['webc-studio'].files,
  },
  {
    id: 'webc-props-events',
    product: 'webc-studio',
    title: 'Props + Events',
    description: 'Typed attributes and a custom event contract.',
    files: [
      { path: 'src/main.tsx', content: webcPropsEntry },
      { path: 'src/stepper.tsx', content: webcPropsEvents },
    ],
  },
  {
    id: 'webc-shadow',
    product: 'webc-studio',
    title: 'Shadow DOM',
    description: 'Encapsulated styles in a shadow root.',
    files: [
      { path: 'src/main.tsx', content: webcShadowEntry },
      { path: 'src/shadow-counter.tsx', content: webcShadow },
    ],
  },
  {
    id: 'webc-slots',
    product: 'webc-studio',
    title: 'Light DOM Slots',
    description: 'Native slot composition for a panel element.',
    files: [
      { path: 'src/main.tsx', content: webcSlotsEntry },
      { path: 'src/panel.tsx', content: webcSlots },
    ],
  },
]

export function examplesFor(
  product: PlaygroundProduct,
): readonly PlaygroundExample[] {
  return examples.filter(example => example.product === product)
}
