# @zeus-js/runtime-ssr

`@zeus-js/runtime-ssr` is the compiler runtime for synchronous server-side
string rendering. Applications normally import the stable facade from
`@zeus-js/zeus/server`:

```ts
import { renderToString } from '@zeus-js/zeus/server'
```

## Public Runtime API

### `renderToString(render)`

Executes an SSR node factory inside an isolated reactive scope, returns escaped
HTML, and disposes the scope before returning. A factory is required so all
component initialization and cleanup belong to that scope. The factory and its
complete result tree must be synchronous. Any Promise or custom thenable in a
component result, text node, attribute, class, style, or property value throws
`renderToString() does not support async render values.`

### `Show(props)` and `For(props)`

Server equivalents of Zeus control-flow built-ins. Compiled JSX normally uses
lower-level helpers directly.

## Compiler Helpers

The package also exports `ssrStatic`, `ssrText`, `ssrAttr`, `ssrProp`,
`ssrElement`, `ssrComponent`, `ssrShow`, and `ssrFor`. They are a contract
between `@zeus-js/compiler` and the runtime, not application-level APIs. In
particular, `ssrStatic` accepts compiler-owned, pre-escaped HTML and must not be
used with untrusted input. `ssrProp` accepts only string, number, and boolean
values from the property whitelist documented in [Server
Rendering](/guide/server-rendering); `ssrElement` resolves those bindings
against the element tag and rejects combinations without an equivalent HTML
representation. For `textarea`, `value` becomes escaped text content and
replaces children.

`ssrElement` also owns raw-text serialization for `script` and `style`.
Ordinary `<` and `&` characters are preserved, while matching closing tags are
rewritten only after the complete child sequence has been joined. Script text
also rewrites `<script` sequences when they would enter the HTML parser's
double-escaped state. This prevents early element termination even when a
significant sequence spans multiple SSR nodes. An already serialized
`SSRFragment` is rejected in raw text because its original text escaping context
cannot be recovered.

See [Server Rendering](/guide/server-rendering) for application setup and the
current limitations.
