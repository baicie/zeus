# Bundler Plugin

The Vite plugin orchestrates component analysis and output generation as part of your build.

## Setup

```ts
import { defineConfig } from 'vite'
import zeus, { componentLibrary } from '@zeus-js/web-c/vite'

export default defineConfig({
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
        exclude: ['src/components/**/*.test.{ts,tsx}'],
      },
      plugins: componentLibrary({ targets: ['wc', 'react'] }),
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
  plugins: ZeusComponentPlugin[]
}
```

## Outputs

The `componentLibrary()` preset receives the component manifest and generates:

- Web Component JS files
- React/Vue wrapper components
- CSS, manifest, and TypeScript declaration files

## Dev mode

In development, the plugin analyzes components on-the-fly and registers custom elements automatically. Output files are generated only on build.

## Manifest

During build, a `zeus.components.json` manifest is written to the output directory:

```bash
dist/zeus.components.json
```

This file contains the full component manifest and can be consumed by documentation generators, IDE plugins, or custom tooling.
