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
the matching `<!--zeus:hydrate:...-->` markers, and closes every dynamic text
value with `<!--zeus:hydrate:/-->` so that the HTML parser cannot merge it with
adjacent static text and an empty value keeps its position. Nodes owned by
conditional, list, transition, and dynamic-region branches carry
`optional: true`; absence of their marker means that branch did not render on
the server, while a marker whose target node is malformed remains an error. Diagnostics return
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

With `delegateEvents: true`, bubbling events are dispatched from one document
listener per event name. Events that do not bubble to `document` (for example
`mouseenter`, `pointerleave`, `scroll`, `load`, `error`, `toggle` and media
events) are always bound directly on their element. With `delegateEvents: false`
every event is bound directly and no `delegateEvents(...)` call is emitted.

In SSR output, static JSX text is HTML-escaped at compile time. Text inside
`<textarea>` and `<title>` is escaped and carries no hydration markers, because
the client binds it through `textContent`; `<script>` and `<style>` content is
emitted raw.

The Node adapter runs each transform on a dedicated thread with a large stack.
Because a parser stack overflow aborts the whole process, a lexical preflight
runs before Oxc and returns the structured `ZEUS_INPUT_TOO_DEEP` diagnostic for
pathological input. The preflight measures what actually consumes the worker
stack rather than bracket depth alone, so an arrow chain `(a) => (b) => …`, a
member chain `a.a.a…`, a template substitution chain or a JSX text apostrophe
cannot slip past it. The budget is equivalent to 8,192 nested JSX elements,
which is the documented limit; every other construct is rejected at roughly a
third of the depth that would abort the worker. Ordinary modules stay far below
the budget: `,` and `;` end a statement, and so does a line break after a
completed value, which is what semicolon-free source relies on. Long sibling
sequences, flat argument lists, large object literals and multi-line modules
therefore never accumulate.

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
