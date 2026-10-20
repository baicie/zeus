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

Automatic root HMR is enabled by default. Executable updates reset local
component state and create new DOM nodes. Ordinary comment edits keep the
existing state and DOM when executable code, comment line terminators and
compiler directives remain unchanged. If a module already contains `import.meta.hot`, the
plugin assumes that module owns its HMR lifecycle and does not inject another
boundary. Set `hmr: false` to disable the automatic behavior globally.

HMR currently classifies updates as stylesheet, ordinary comment text, template
structure, Signal initialization, component API, or unknown. Stylesheet files
stay on Vite's CSS HMR path; safe ordinary comment edits skip invalidation.
Changes to comment directives such as `@once` or JSX pragmas recompile.
The classifier uses parsed TS/JSX comment ranges, so comment-like text inside
templates and nested JSX remains executable content. Parse failures remount.
Every executable TSX update uses complete dispose-and-remount: roots are
registered before module initialization, captured as each `render()` succeeds,
and disposed in reverse order even when one disposer throws. State retention
for executable changes requires proof of owner and listener safety.
An updated dependency without a local render root is allowed to propagate to
Vite's normal page-reload fallback.

## Production

In production, the plugin:

- Enables static template cloning
- Emits direct DOM bindings
- Omits development-only HMR boundaries
