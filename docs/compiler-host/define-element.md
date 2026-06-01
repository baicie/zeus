# defineElement

`defineElement` is the core API for declaring a Zeus Web Component.

## Signature

```tsx
defineElement<TProps>(
  tag: string,
  options: DefineElementOptions,
  setup: (props: TProps) => JSX.Element
): ComponentRef<TProps>
```

## Options

```ts
interface DefineElementOptions {
  /** Use shadow DOM (default: false) */
  shadow?: boolean

  /** Observed attributes. Zeus infers these from props, but you can add extra ones. */
  attrs?: string[]

  /** Custom element props schema */
  props?: Record<string, PropSchema>

  /** Custom element events */
  events?: Record<string, EventSchema>

  /** Named slots this element accepts */
  slots?: Record<string, SlotSchema>

  /** Exposed shadow DOM ::part() names */
  cssParts?: string[]

  /** Exposed custom CSS property names */
  cssVars?: string[]
}
```

## Prop schema

```ts
interface PropSchema {
  type: 'String' | 'Number' | 'Boolean' | 'Object' | 'Array'
  default?: unknown
  reflect?: boolean // reflect to attribute
  attribute?: string // custom attribute name
}
```

## Event schema

```ts
interface EventSchema {
  detail?: Record<string, string> // type map for detail properties
  bubbles?: boolean
  composed?: boolean
}
```

## Example

```tsx
import { defineElement, Host, Slot } from '@zeus-js/zeus'

export const ZCard = defineElement<{
  title?: string
  open?: boolean
}>(
  'z-card',
  {
    shadow: true,
    props: {
      title: {
        type: String,
        reflect: true,
      },
      open: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },
    slots: {
      header: { description: 'Content for the card header' },
      footer: { description: 'Content for the card footer' },
    },
    cssParts: ['body', 'header'],
    cssVars: ['--card-padding', '--card-radius'],
  },
  props => (
    <Host>
      <header part="header">
        <Slot name="header" />
      </header>
      <section part="body" style={{ padding: 'var(--card-padding, 1rem)' }}>
        <Slot />
      </section>
    </Host>
  ),
)
```
