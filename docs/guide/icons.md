# Icons

Zero-runtime SVG icon output.

## How it works

Icons are declared as build inputs and emitted as pure SVG files. No JavaScript
runtime is needed to render the generated files.

## Install

```bash
pnpm add @zeus-js/web-c
pnpm add -D vite
```

## Configure

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/web-c/vite'
import { icons } from '@zeus-js/web-c'

export default defineConfig({
  plugins: [
    zeus({
      plugins: [
        icons({
          icons: [
            {
              name: 'check',
              svg: '<svg viewBox="0 0 16 16"><path d="M3 8l3 3 7-7" /></svg>',
            },
          ],
          outDir: 'icons',
        }),
      ],
    }),
  ],
})
```

## Output

Each icon becomes a standalone `.svg` file:

```
dist/icons/svg/chevron-left.svg
dist/icons/svg/chevron-right.svg
dist/icons/svg/x.svg
...
```

## Use in HTML

```html
<img src="/icons/svg/chevron-left.svg" alt="Previous" />
```

## Use as React/Vue component

The icons output can be consumed as inline SVG in your framework:

```tsx
import { IconX } from './dist/icons/react'
```

This uses the runtime icon component from headless, which inlines the SVG at runtime.
