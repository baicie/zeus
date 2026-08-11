# @zeus-js/compiler

Rust-native JSX/TSX compiler. The package exposes one transform contract and
does not provide a Babel plugin or a second compiler backend.

## `transformModule`

```ts
import { transformModule } from '@zeus-js/compiler'

const result = transformModule({
  source: 'const view = <button>{count()}</button>',
  filename: 'view.tsx',
  target: 'dom',
  runtimeModule: '@zeus-js/runtime-dom',
  delegateEvents: true,
  sourceMap: true,
})
```

The result contains generated JavaScript, an optional Source Map v3, and
structured diagnostics. Diagnostics are returned for compiler errors and are
not hidden in an exception message.

## Options

| Option           | Type             | Description                                            |
| ---------------- | ---------------- | ------------------------------------------------------ |
| `source`         | `string`         | Module source containing JSX/TSX.                      |
| `filename`       | `string`         | Stable source filename used by diagnostics and maps.   |
| `target`         | `'dom' \| 'ssr'` | Select DOM or server code generation.                  |
| `runtimeModule`  | `string`         | Runtime module imported by generated code.             |
| `delegateEvents` | `boolean`        | Enable delegated event collection for DOM output.      |
| `sourceMap`      | `boolean`        | Generate a Source Map v3.                              |
| `hmr`            | `boolean`        | Inject the development render boundary when supported. |

`hmr` is only meaningful for DOM development transforms. It is ignored for SSR,
production, component-only modules, and modules with an explicit
`import.meta.hot` boundary.

## Targets

DOM output creates static templates and direct runtime bindings. SSR output
serializes the same owned IR and omits event/ref bindings. `Host` and `Slot`
remain Web Components compiler builtins; unsupported SSR forms return a
structured diagnostic.

## Native packages

`@zeus-js/compiler` loads `@zeus-js/compiler-native`, which selects the
platform package for the current Node.js OS, architecture, and libc. A native
load failure includes every attempted binary/package error so installation
problems are actionable.
