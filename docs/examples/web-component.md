# Web Component

Define a custom element with `defineElement`.

```tsx
import { createSignal, defineElement, Host, Slot } from '@zeus-js/zeus'

defineElement(
  'z-counter',
  {
    shadow: false,
    props: {
      initialCount: Number,
    },
  },
  props => {
    const [count, setCount] = createSignal(props.initialCount ?? 0)

    return (
      <Host>
        <button onClick={() => setCount(count() + 1)}>count: {count()}</button>
        <p>
          <Slot />
        </p>
      </Host>
    )
  },
)
```

Usage in HTML:

```html
<z-counter initial-count="10"> This is slotted content </z-counter>

<script type="module" src="/src/main.tsx"></script>
```

## Key concepts

- `defineElement` registers a custom element
- `Host` represents the custom element itself
- `Slot` projects light DOM or shadow DOM content
- `props` are reactive and typed
