# Icons

Zero-runtime SVG icon output.

## How it works

Icons are extracted from `@zeus-ui/headless` at build time and emitted as pure SVG files — no JavaScript runtime needed to render them.

## Install

```bash
pnpm add @zeus-js/vite-plugin @zeus-js/output-icons
```

## Configure

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin/vite'
import icons from '@zeus-js/output-icons/vite'

export default defineConfig({
  plugins: [
    zeus({
      components: {
        include: ['node_modules/@zeus-ui/headless/dist/wc/*.js'],
      },
      outputs: [
        icons({
          outDir: 'dist/icons',
        }),
      ],
    }),
  ],
})
```

## Output

Each icon becomes a standalone `.svg` file:

```
dist/icons/chevron-left.svg
dist/icons/chevron-right.svg
dist/icons/x.svg
...
```

## Use in HTML

```html
<img src="/dist/icons/chevron-left.svg" alt="Previous" />
```

## Use as React/Vue component

The icons output can be consumed as inline SVG in your framework:

```tsx
import { IconX } from '@zeus-ui/headless/icons'
```

This uses the runtime icon component from headless, which inlines the SVG at runtime.
