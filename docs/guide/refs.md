# Refs

Use `ref` to access DOM elements.

## Basic usage

```tsx
import { state } from '@zeus-js/zeus'

function TextInput() {
  const inputRef = state<HTMLInputElement | null>(null)
  const text = state('')

  return (
    <div>
      <input
        ref={inputRef}
        value={text.value}
        onInput={e => {
          text.value = e.currentTarget.value
          // Access the DOM element
          inputRef.value?.focus()
        }}
      />
      <p>Typed: {text.value}</p>
    </div>
  )
}
```

## Ref callback

For advanced cases, `ref` can also be a callback:

```tsx
function AutoFocus() {
  let inputEl: HTMLInputElement | undefined

  return (
    <input
      ref={el => {
        inputEl = el
        el?.focus()
      }}
    />
  )
}
```

## Ref vs state

- `ref={state}` — binds a reactive state to a DOM element
- `state` — stores the element reference reactively
