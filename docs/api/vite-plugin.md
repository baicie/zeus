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

Executable updates use a dispose-and-remount model. Local signal state is
reset; DOM nodes and component state are not preserved. Plain comment edits
that leave executable code, comment line terminators, and compiler directives
unchanged skip module invalidation and retain the existing roots. Production
builds and SSR transforms do not contain the HMR boundary.

Set `hmr: false` to disable automatic boundaries. A module that contains its
own `import.meta.hot` handling is also left unchanged.

### HMR update classes

The plugin records a conservative update class for development diagnostics:

| Update                                          | Current strategy                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| CSS/stylesheet module                           | Vite CSS HMR (`vite-style`); Zeus roots are not remounted                                    |
| Ordinary comment text only                      | `preserve-state`; existing roots, owners and DOM nodes remain                                |
| Template structure                              | `dispose-remount`; direct render roots are disposed and remounted                            |
| Signal initialization                           | `dispose-remount`; direct render roots are disposed and remounted                            |
| Component API (`defineElement`, props, exports) | `dispose-remount`; direct roots are disposed, dependency-only updates propagate through Vite |
| Unknown change                                  | `dispose-remount`; direct render roots are disposed and remounted                            |

Ordinary comment edits retain Signal state and DOM identity only when every
other source byte and each comment line terminator is unchanged. Edits to
compiler or bundler directives, including `@once`, JSX pragmas and PURE
annotations, always recompile so their semantics and diagnostics are applied.
The classifier uses parser-provided TS/JSX comment ranges; comment-like text in
nested templates, JSX, strings and regular expressions remains unchanged.
Invalid or unsupported syntax always recompiles.
The generated root boundary is registered before module initialization, captures each successful `render()`
disposer immediately, and disposes roots in reverse mount order. Each disposer
is isolated so one cleanup error cannot leave other owners or listeners alive.
All executable edits continue to dispose and remount. Any wider state
retention requires a separate proof of owner, listener, and DOM identity safety.
When a changed dependency has no local render root, Vite's unaccepted-update
propagation may reload the importing page; the plugin does not claim component
state preservation for that path.

### compiler

Overrides the native transform options passed to `transformModule`. The only
compiler options are `moduleName` and `delegateEvents`.

The plugin excludes `@zeus-js/zeus`, `@zeus-js/signal`,
`@zeus-js/runtime-dom` and `@zeus-js/runtime-ssr` from dependency prebundling.
These ESM packages share one module graph, including signal subpath imports,
whether installed from npm or linked in a workspace. Compiler-injected imports
can then load without mixing optimized and unoptimized signal engines during
cold development startup. A custom `moduleName` owns its dependency setup;
virtual modules should be resolved by their providing plugin.

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
