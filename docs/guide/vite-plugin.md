# Vite Plugin

## Installation

```bash
pnpm add -D @zeus-js/vite-plugin
```

## Configuration

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [
    zeus({
      include: /\.tsx$/,
      exclude: /node_modules/,
      hmr: true,
      compiler: {
        moduleName: '@zeus-js/runtime-dom',
      },
    }),
  ],
})
```

## TypeScript

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@zeus-js/zeus",
    "types": ["@zeus-js/zeus/jsx"]
  }
}
```

## Development

In dev mode, the plugin:

- Compiles JSX on the fly
- Provides source maps
- Reports structured compiler diagnostics
- Disposes and remounts modules with a direct top-level `render()` root

Automatic root HMR is enabled by default. It resets local component state and
does not reuse DOM nodes. If a module already contains `import.meta.hot`, the
plugin assumes that module owns its HMR lifecycle and does not inject another
boundary. Set `hmr: false` to disable the automatic behavior globally.

## Production

In production, the plugin:

- Enables static template cloning
- Emits direct DOM bindings
- Omits development-only HMR boundaries
