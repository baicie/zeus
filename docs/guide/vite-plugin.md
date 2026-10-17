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

HMR currently classifies updates as stylesheet, template structure, Signal
initialization, component API, or unknown. Stylesheet files stay on Vite's CSS
HMR path. Every TSX class uses complete dispose-and-remount: roots are
registered before module initialization, captured as each `render()` succeeds,
and disposed in reverse order even when one disposer throws. Signal state and
DOM identity are not retained until their owner and listener safety is proven.
An updated dependency without a local render root is allowed to propagate to
Vite's normal page-reload fallback.

## Production

In production, the plugin:

- Enables static template cloning
- Emits direct DOM bindings
- Omits development-only HMR boundaries
