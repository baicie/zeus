# Refs

Use the JSX `ref` protocol to access DOM elements.

## Callback ref

```tsx
import { createSignal } from '@zeus-js/zeus'

function TextInput() {
  const [text, setText] = createSignal('')
  let input: HTMLInputElement | null = null

  return (
    <div>
      <input
        ref={element => {
          input = element
        }}
        prop:value={text()}
        onInput={event => {
          setText(event.currentTarget.value)
          input?.focus()
        }}
      />
      <p>Typed: {text()}</p>
    </div>
  )
}
```

The callback receives the element on mount and `null` when its owner subtree is disposed.

## Immediate focus

```tsx
function AutoFocus() {
  return (
    <input
      ref={element => {
        element?.focus()
      }}
    />
  )
}
```

Refs are DOM ownership hooks, not a second state primitive. Use `createSignal` for application state.
