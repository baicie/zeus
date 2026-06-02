# Quick Start

Build Web Components once, use them everywhere.

## Install

```bash
pnpm add @zeus-js/zeus
pnpm add -D @zeus-js/vite-plugin @zeus-js/output-wc
```

## Create a component

```tsx
import { defineElement, Host, Slot } from '@zeus-js/zeus'

export interface ButtonProps {
  variant?: 'default' | 'outline'
  disabled?: boolean
}

export const ZButton = defineElement<ButtonProps>(
  'z-button',
  {
    shadow: false,
    props: {
      variant: {
        type: String,
        default: 'default',
        reflect: true,
      },
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
    },
  },
  props => {
    return (
      <Host
        data-variant={props.variant}
        data-disabled={props.disabled ? '' : undefined}
      >
        <button disabled={props.disabled}>
          <Slot />
        </button>
      </Host>
    )
  },
)
```

## Configure Vite

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin/vite'
import wc from '@zeus-js/output-wc/vite'

export default defineConfig({
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      outputs: [
        wc({
          outDir: 'dist/wc',
        }),
      ],
    }),
  ],
})
```

## Use it

```ts
import './dist/wc/z-button.js'
```

```html
<z-button variant="outline">Button</z-button>
```

## Next steps

- [Web Components](/guide/web-components) — deep dive into `defineElement`, `Host`, and `Slot`
- [React](/guide/react) — generate React wrappers from the same source
- [Vue](/guide/vue) — generate Vue wrappers
- [Registry](/guide/registry) — use the shadcn-like component registry CLI
