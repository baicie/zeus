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
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[]
  hmr?: boolean
  ssrModuleName?: string
  compiler?: { moduleName?: string; delegateEvents?: boolean }
})
```

### include / exclude

Control which module ids are compiled. By default, Zeus includes `.jsx` and
`.tsx` files and excludes `node_modules`.

### hmr

Enabled by default. During Vite development, a module with a direct top-level
`render()` call imported from `@zeus-js/zeus` or `@zeus-js/runtime-dom` becomes
a self-accepting HMR boundary. Zeus captures the render disposer, disposes old
roots in reverse mount order, and lets the updated module mount fresh roots.

This lifecycle is a dispose-and-remount model. Local signal state is reset; DOM
nodes and component state are not preserved. Production builds and SSR
transforms do not contain the HMR boundary.

Set `hmr: false` to disable automatic boundaries. A module that contains its
own `import.meta.hot` handling is also left unchanged.

### compiler

Overrides the native transform options passed to `transformModule`. The only
compiler options are `moduleName` and `delegateEvents`.

### ssrModuleName

Overrides the runtime module imported by SSR transforms. It defaults to
`@zeus-js/runtime-ssr` and is independent from `compiler.moduleName`, which
continues to configure browser transforms. Vite SSR transforms automatically
select native compiler target `ssr`.

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
