# Icons Output

Provide inline SVG sources and emit zero-runtime SVG files.

## Options

```ts
interface OutputIconsOptions {
  icons: Array<{ name: string; svg: string; title?: string }>
  outDir?: string
  svg?: boolean
  react?: boolean | { outDir?: string }
  vue?: boolean | { outDir?: string }
  wc?: boolean | { outDir?: string; tagPrefix?: string }
  dts?: boolean
}
```

## Usage

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
dist/icons/
  svg/check.svg
  react/check.js
  react/index.js
  vue/check.js
  vue/index.js
  ...
```

## Usage

### In HTML

```html
<img src="/icons/chevron-right.svg" alt="Next" />
```

### As React component

```tsx
import { IconCheck } from './dist/icons/react'

// Inline SVG rendered at runtime
;<IconCheck size={24} className="text-muted-foreground" />
```

The `IconX` component inlines the SVG path, useful when you need dynamic color or sizing.
