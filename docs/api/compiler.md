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

The result contains generated JavaScript, an optional Source Map v3, structured
diagnostics, and a `hydrationPlan`. Diagnostics are returned for compiler
errors and are not hidden in an exception message.

`hydrationPlan` is shared by DOM and SSR transforms of the same source. It maps
stable component, node, element, text, and control-flow IDs to binding IDs and
kinds such as `text`, `attr`, `prop`, `event`, and `spread`. SSR output writes
the matching `<!--zeus:hydrate:...-->` markers. Diagnostics return
`hydrationPlan: null` because no code is emitted.

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

The generated hydration plan is metadata for the explicit
`hydrate(container, setup)` runtime API. It provides the stable IDs required to
reuse existing DOM and reconnect fine-grained bindings; it does not execute a
component tree or infer state from arbitrary HTML.

## Native packages

`@zeus-js/compiler` loads `@zeus-js/compiler-native`, which selects the
platform package for the current Node.js OS, architecture, and libc. A native
load failure includes every attempted binary/package error so installation
problems are actionable.
