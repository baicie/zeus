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

A callback runs **outside reactive tracking**. Reading a signal inside one does
not subscribe the region that mounted the element, so the callback never
re-runs because of that read — it re-runs only when its element is created
again:

```tsx
// Seeds the field once. Typing does not re-create the input, so this does not
// re-run and cannot overwrite what the user typed.
<input ref={element => seed(element, draft().email)} />
```

To keep something in sync with a signal, use `createEffect` (or a binding), not
a ref. This is the same rule [spread](./runtime-semantics.md) applies to refs
it carries.

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
