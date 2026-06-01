# Web Component Output

Emits native custom element JavaScript files from `defineElement` sources.

## Options

```ts
interface OutputWcOptions {
  /** Output directory (relative to project root) */
  outDir: string

  /** Inject import statements into generated files */
  injectImports?: string[]

  /** Additional file extensions to process */
  extensions?: string[]
}
```

## Output structure

```
dist/wc/
  z-button.js
  z-card.js
  z-dialog.js
  index.js       # barrel with all registered elements
```

## Usage

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin/vite'
import wc from '@zeus-js/output-wc/vite'

export default defineConfig({
  plugins: [
    zeus({
      components: { include: ['src/components/**/*.ts'] },
      outputs: [wc({ outDir: 'dist/wc' })],
    }),
  ],
})
```

## Registering elements

Import the barrel file to register all elements:

```ts
import './dist/wc/index.js'
```

Or import individual elements:

```ts
import './dist/wc/z-button.js'
```

## Custom elements.json

The output includes a `custom-elements.json` manifest at `dist/wc/custom-elements.json`, compatible with tooling like Web Component devtools and IDE extensions.
