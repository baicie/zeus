# Components

## Basic component

```tsx
import { state } from '@zeus-js/zeus'

function Counter() {
  const count = state(0)

  return (
    <div>
      <span>{count.value}</span>
      <button onClick={() => count.value++}>+</button>
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
  const count = state(initialCount)

  return (
    <div>
      <h2>{title}</h2>
      <span>{count.value}</span>
      <button onClick={() => count.value++}>+</button>
    </div>
  )
}
```

## Local state

Each component instance has its own state. State is created on initialization.

## Component lifecycle

The component function runs **once** on initialization. Subsequent updates are driven by `state` changes, not re-renders.
