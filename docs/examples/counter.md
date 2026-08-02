# Counter

A simple counter demonstrating signals and event binding.

```tsx
import { createSignal, render } from '@zeus-js/zeus'

function Counter() {
  const [count, setCount] = createSignal(0)

  return (
    <div>
      <h1>{count()}</h1>
      <button onClick={() => setCount(count() - 1)}>-</button>
      <button onClick={() => setCount(count() + 1)}>+</button>
    </div>
  )
}

render(() => <Counter />, document.getElementById('root')!)
```

## Key concepts

- `createSignal()` for reactive values
- `onClick` event binding
- Component initialization runs once, updates are driven by signal changes
