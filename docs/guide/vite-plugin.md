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
      // Enable development diagnostics
      dev: true,
      // Target output: 'dom' (default) or 'web-components'
      target: 'dom',
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
- Generates readable runtime helper calls
- Provides source maps

## Production

In production, the plugin:
- Enables static template cloning
- Minifies helper names
- Dead code eliminates unused runtime helpers
