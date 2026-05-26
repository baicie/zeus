# Counter

A simple counter demonstrating state and event binding.

```tsx
import { render, state } from '@zeus-js/zeus'

function Counter() {
  const count = state(0)

  return (
    <div>
      <h1>{count.value}</h1>
      <button onClick={() => count.value--}>-</button>
      <button onClick={() => count.value++}>+</button>
    </div>
  )
}

render(() => <Counter />, document.getElementById('root')!)
```

## Key concepts

- `state()` for reactive primitive values
- `onClick` event binding
- Component initialization runs once, updates are driven by state changes
