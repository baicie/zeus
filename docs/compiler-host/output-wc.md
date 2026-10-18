# Web Component Output

Emits native custom element JavaScript files from `defineElement` sources.

## Options

```ts
interface OutputWCOptions {
  outDir?: string
  stripPrefix?: string | false
  fileName?: (tag: string) => string
  manifestFile?: string | false
  customElementsFile?: string | false
  dts?: boolean | 'auto'
  jsxDts?: boolean | 'auto'
  index?: boolean
  register?: 'lazy' | 'side-effect'
  auto?: boolean
}
```

## Output structure

```
dist/wc/
  z-button.js          # lazy registration bridge
  z-button.entry.js    # component implementation chunk
  z-card.js
  z-card.entry.js
  z-dialog.js
  z-dialog.entry.js
  components.manifest.js
  loader.js
  auto.js              # registers every component when imported
  index.js              # exports loader functions
```

## Usage

```ts
import { defineConfig } from 'vite'
import zeus, { wc } from '@zeus-js/web-c/vite'

export default defineConfig({
  plugins: [
    zeus({
      components: { include: ['src/components/**/*.ts'] },
      plugins: [
        wc({
          outDir: 'wc',
          manifestFile: 'zeus.components.json',
          customElementsFile: 'custom-elements.json',
          dts: true,
          jsxDts: true,
        }),
      ],
    }),
  ],
})
```

## Registering elements

Import the auto entry to register all elements:

```ts
import './dist/wc/auto.js'
```

For explicit registration, import the loader and call it with a registry:

```ts
import { defineCustomElements } from './dist/wc/index.js'

defineCustomElements()
```

The per-component `z-button.js` files expose `defineCustomElement()` and are
registration bridges; importing them alone does not register the element.

## Custom elements.json

The output includes a `custom-elements.json` manifest at `dist/custom-elements.json`, compatible with tooling like Web Component devtools and IDE extensions.
