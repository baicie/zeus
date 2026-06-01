# Icons Output

Extract icon components from headless and emit zero-runtime SVG files.

## Options

```ts
interface OutputIconsOptions {
  /** Output directory for SVG files */
  outDir: string

  /** Icon names to extract (default: all) */
  include?: string[]

  /** Icon names to exclude */
  exclude?: string[]

  /** SVG optimization options */
  optimize?: {
    /** Remove empty attributes (default: true) */
    removeEmptyAttrs?: boolean
    /** Convert colors (default: 'currentColor') */
    color?: string
  }
}
```

## Usage

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
          outDir: 'public/icons',
          optimize: { color: 'currentColor' },
        }),
      ],
    }),
  ],
})
```

## Output

Each icon becomes a standalone `.svg` file:

```
public/icons/
  x.svg
  check.svg
  chevron-left.svg
  chevron-right.svg
  plus.svg
  ...
```

## Usage

### In HTML

```html
<img src="/icons/chevron-right.svg" alt="Next" />
```

### As React component

```tsx
import { IconX } from '@zeus-ui/headless/react'

// Inline SVG rendered at runtime
<IconX size={24} class="text-muted-foreground" />
```

The `IconX` component inlines the SVG path, useful when you need dynamic color or sizing.
