// For with index
export function ForWithIndex() {
  const items = ['apple', 'banana', 'cherry']
  return (
    <ul>
      <For each={items}>
        {(item, index) => (
          <li key={index()}>
            {index()}: {item}
          </li>
        )}
      </For>
    </ul>
  )
}

// For with object items
export function ForWithObjects() {
  const items = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Charlie' },
  ]
  return (
    <ul>
      <For each={items}>{item => <li key={item.id}>{item.name}</li>}</For>
    </ul>
  )
}

// For nested
export function NestedFor() {
  const matrix = [
    [1, 2, 3],
    [4, 5, 6],
  ]
  return (
    <div>
      <For each={matrix}>
        {row => (
          <div>
            <For each={row}>{cell => <span>{cell} </span>}</For>
          </div>
        )}
      </For>
    </div>
  )
}

// For with empty array
export function EmptyFor() {
  const items: string[] = []
  return (
    <ul>
      <For each={items}>{item => <li>{item}</li>}</For>
    </ul>
  )
}

// Show simple
export function ShowSimple() {
  const visible = true
  return (
    <Show when={visible}>
      <div>Content is visible</div>
    </Show>
  )
}

// Show with null/undefined
export function ShowUndefined() {
  let value: string | undefined = undefined
  return (
    <Show when={value}>
      <span>{value}</span>
    </Show>
  )
}

// Show with fallback
export function ShowWithFallback() {
  const user = null
  return (
    <Show when={user} fallback={<span>Guest</span>}>
      {u => <span>{u.name}</span>}
    </Show>
  )
}
