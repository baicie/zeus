# Components

## Basic component

```tsx
import { createSignal } from '@zeus-js/zeus'

function Counter() {
  const [count, setCount] = createSignal(0)

  return (
    <div>
      <span>{count()}</span>
      <button onClick={() => setCount(count() + 1)}>+</button>
    </div>
  )
}
```

## Props

```tsx
interface Props {
  title: string
  initialCount?: number
}

function Counter({ title, initialCount = 0 }: Props) {
  const [count, setCount] = createSignal(initialCount)

  return (
    <div>
      <h2>{title}</h2>
      <span>{count()}</span>
      <button onClick={() => setCount(count() + 1)}>+</button>
    </div>
  )
}
```

## Local signals

Each component instance creates its own signals during initialization.

## Component lifecycle

The component function runs **once** on initialization. Subsequent updates are driven by signal changes, not re-renders.
