# @zeus-js/vite-plugin

Vite plugin for Zeus JSX transformation.

## Installation

```bash
pnpm add -D @zeus-js/vite-plugin
```

## Usage

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
```

## Options

```ts
zeus({
  dev?: boolean
  target?: 'dom' | 'web-components'
})
```

### dev

Enable development mode with readable output and diagnostics.

### target

- `'dom'` — standard DOM rendering (default)
- `'web-components'` — compiles to custom elements

## TypeScript

Add to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@zeus-js/zeus",
    "types": ["@zeus-js/zeus/jsx"]
  }
}
```
