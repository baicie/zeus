# Web Components

Define custom elements with Zeus.

## defineElement

```tsx
import { createSignal, defineElement, Host } from '@zeus-js/zeus'

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
      </Host>
    )
  },
)
```

## Host

`Host` represents the custom element itself.

## Slot

Project light DOM or shadow DOM content.

```tsx
defineElement(
  'z-card',
  {
    shadow: true,
  },
  () => (
    <Host>
      <header>
        <Slot name="header" />
      </header>
      <main>
        <Slot />
      </main>
    </Host>
  ),
)
```

Usage:

```html
<z-card>
  <span slot="header">Title</span>
  <p>Content</p>
</z-card>
```

## Shadow DOM

Set `shadow: true` to use shadow DOM. CSS is encapsulated.
