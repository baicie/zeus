# @zeus-js/compiler

JSX compiler package.

## Babel Plugin

The package's default export is a Babel plugin that compiles JSX into Zeus
runtime helper calls.

```ts
import { transformAsync } from '@babel/core'
import zeusCompiler from '@zeus-js/compiler'

const result = await transformAsync('const view = <div>{name}</div>', {
  babelrc: false,
  configFile: false,
  filename: 'view.tsx',
  plugins: [[zeusCompiler, { generate: 'dom' }]],
})
```

## CompilerOptions

| Option         | Type             | Default               | Description                             |
| -------------- | ---------------- | --------------------- | --------------------------------------- |
| `generate`     | `'dom' \| 'ssr'` | `'dom'`               | Select DOM or server string codegen     |
| `moduleName`   | `string`         | Depends on `generate` | Runtime module used by generated code   |
| `staticMarker` | `string`         | `'@once'`             | Static expression marker                |
| `builtIns`     | `string[]`       | `[]`                  | Additional component names to recognize |

The default module is `@zeus-js/runtime-dom` for `dom` output and
`@zeus-js/runtime-ssr` for `ssr` output. An explicit `moduleName` overrides the
default for the selected compilation.

## DOM Output

Generates DOM runtime helper calls.

## SSR Output

Set `generate: 'ssr'` when compiling a server module directly:

```ts
plugins: [[zeusCompiler, { generate: 'ssr' }]]
```

SSR output uses the same Zeus IR as DOM output, omits event and ref bindings,
and emits synchronous serialization helpers. Script and style children retain
raw-text semantics; matching closing tags and script sequences that would enter
the HTML parser's double-escaped state are safely rewritten after their children
are joined. Raw-text children may contain text, Fragment, `Show`, and `For`;
element or component children are rejected with
`ZEUS_UNSUPPORTED_SSR_RAW_TEXT_CHILD`. `Host` and `Slot` are rejected with a
structured diagnostic because Web Components SSR is outside the current
contract. Each property binding is validated against both its property name and
element tag. Bindings without a deterministic HTML representation are rejected
with `ZEUS_UNSUPPORTED_SSR_PROPERTY`. See [Server
Rendering](/guide/server-rendering) for the supported property mappings,
application entry, and limitations.
