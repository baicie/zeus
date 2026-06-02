# Bundler Plugin

The Vite plugin orchestrates component analysis and output generation as part of your build.

## Setup

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin/vite'
import wc from '@zeus-js/output-wc/vite'
import react from '@zeus-js/output-react-wrapper/vite'

export default defineConfig({
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
        exclude: ['src/components/**/*.test.{ts,tsx}'],
      },
      outputs: [wc({ outDir: 'dist/wc' }), react({ outDir: 'dist/react' })],
    }),
  ],
})
```

## Options

```ts
interface ZeusPluginOptions {
  /** Component source globs */
  components: {
    include: string | string[]
    exclude?: string | string[]
  }

  /** Output generators */
  outputs: OutputPlugin[]
}
```

## Outputs

Outputs are plugins that receive the component manifest and generate files:

- `wc` — native Web Component JS files
- `react` — React wrapper components
- `vue` — Vue 3 wrapper components
- `icons` — pure SVG icon files
- `dts` — TypeScript declaration files

## Dev mode

In development, the plugin analyzes components on-the-fly and registers custom elements automatically. Output files are generated only on build.

## Manifest

During build, a `zeus.components.json` manifest is written to the output directory:

```bash
dist/zeus.components.json
```

This file contains the full component manifest and can be consumed by documentation generators, IDE plugins, or custom tooling.
