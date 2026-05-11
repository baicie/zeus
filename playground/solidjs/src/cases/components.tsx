// Custom component usage with For and Show built-ins
import { For, Show } from 'solid-js'

interface Props {
  title: string
  count?: number
}

export function MyComponent(props: Props) {
  return (
    <div class="component">
      <h1>{props.title}</h1>
      <Show when={props.count !== undefined}>
        <span>Count: {props.count}</span>
      </Show>
    </div>
  )
}

// Nested components
export function ParentComponent() {
  return (
    <div>
      <MyComponent title="Hello" />
      <MyComponent title="World" count={5} />
    </div>
  )
}

// Component with For list
export function ListComponent() {
  const items = ['a', 'b', 'c']
  return (
    <ul>
      <For each={items}>{item => <li>{item}</li>}</For>
    </ul>
  )
}

// Component with Show else branch
export function ConditionalComponent() {
  const loggedIn = false
  return (
    <div>
      <Show when={loggedIn} fallback={<span>Please log in</span>}>
        <span>Welcome!</span>
      </Show>
    </div>
  )
}

// Dynamic component (mixed-case tag)
export function DynamicTag() {
  const tag = 'div'
  return <div>Dynamic tag: {tag}</div>
}
