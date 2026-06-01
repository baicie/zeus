# Host and Slot

`Host` and `Slot` are built-in primitives that represent the custom element boundary and content projection.

## Host

`Host` represents the custom element itself. It is only valid as the root of a `defineElement` render function.

```tsx
import { defineElement, Host } from '@zeus-js/zeus'

defineElement('z-panel', { shadow: false }, () => (
  <Host data-panel>
    <div>Content</div>
  </Host>
))
```

### Host attributes

Set `data-*` attributes on `Host` to expose internal state to CSS and external JS:

```tsx
<Host data-open={isOpen()} data-variant={variant()}>
  <div>Content</div>
</Host>
```

### Shadow DOM mode

Set `shadow: true` to attach a shadow root. CSS defined inside `Host` is encapsulated.

```tsx
defineElement('z-card', { shadow: true }, () => (
  <Host>
    <style>{`
        :host {
          display: block;
          border-radius: 8px;
        }
      `}</style>
    <slot />
  </Host>
))
```

### Light DOM mode

With `shadow: false` (default), the component uses light DOM. No encapsulation but simpler debugging and easier integration.

## Slot

`Slot` projects child content from the light DOM into the component.

### Default slot

```tsx
<Host>
  <header>Header</header>
  <main>
    <Slot />
  </main>
  <footer>Footer</footer>
</Host>
```

### Named slot

```tsx
<Host>
  <header>
    <Slot name="header" />
  </header>
  <main>
    <Slot />
  </main>
  <footer>
    <Slot name="footer" />
  </footer>
</Host>
```

Usage:

```html
<z-card>
  <span slot="header">My Card</span>
  <p>Main content goes to the default slot.</p>
  <span slot="footer">Footer text</span>
</z-card>
```

### Shadow DOM slot

When using `shadow: true`, `<Slot>` compiles to the native `<slot>` element and uses the browser's native projection mechanism.

### Light DOM slot

When using `shadow: false`, `<Slot>` uses Zeus's own light DOM projection runtime. It observes child nodes and inserts them at the slot anchor position.

### Fallback content

Slot can contain fallback content that renders when no content is projected:

```tsx
<Slot name="header">
  <h2>Default Title</h2>
</Slot>
```
