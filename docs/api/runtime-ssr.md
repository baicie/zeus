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

## Explicit Shadow DOM serialization and hydration plans

`ssrCustomElement(tag, { attributes, shadowRoot, shadowRootOptions, children })`
serializes a host, an optional Declarative Shadow DOM template, and light DOM
children. Values use the same escaping rules as `ssrElement`; complex client
properties remain outside HTML. This helper accepts already prepared SSR nodes.
It does not execute `defineElement` setup, browser measurements, form lifecycle
callbacks or generate HTML from a component Manifest.

`ssrHydrationMarker(id)` emits a comment marker for a manually paired client
plan. Each id must be unique within the hydration container. On the client,
`hydrate(container, context => { ... })` from `@zeus-js/zeus` reconnects bindings
without replacing server nodes:

```ts
// Server, inside renderToString's synchronous factory:
ssrElement(
  'main',
  [],
  [
    ssrHydrationMarker('name'),
    ssrElement('input', [ssrAttr('value', 'Server')]),
  ],
)
// Client, after locating the existing main element:
hydrate(main, context => {
  context.node('name', 'input') // diagnose a structural mismatch
  context.prop('name', 'value', name)
})
```

The optional tag argument checks the expected element before attaching its
bindings. Missing targets, wrong types, wrong tags and duplicate ids throw
`ZEUS_HYDRATION_*` diagnostics. Hydration never silently clears the container;
applications decide how to repair a mismatch. A failed setup disposes any effects
and listeners attached during that setup. The returned disposer removes bindings
while leaving the DOM in place. Equal input values do not reset selection; seed
client state from `input.value` when edits made before hydration should be kept.

The compiler returns the matching `hydrationPlan` from `transformModule()`.
`hydratePlan(container, plan, handlers)` consumes that structure and requires a
handler for every planned binding:

```ts
import { hydratePlan } from '@zeus-js/zeus'

const dispose = hydratePlan(main, hydrationPlan, {
  [propBindingId](context, binding, node) {
    context.prop(node.id, binding.name!, name)
  },
})
```

The plan marks `text`, `attr`, `prop`, `event` and `spread` bindings with stable
IDs shared by DOM and SSR compilation. A missing handler fails with
`ZEUS_HYDRATION_HANDLER_MISSING` and disposes work already attached during that
setup. Repeated templates such as `For` rows reuse one template id;
`hydratePlan()` invokes their handlers once per occurrence and supplies the
occurrence index for selecting the matching server node.

An open declarative shadow root is hydrated separately with
`hydrate(host.shadowRoot, setup)`. The browser owns native slot projection.
Closed roots cannot be discovered this way. Compiler marker and binding plans
are available for DOM trees, while automatic component execution,
`defineElement` internal hydration, streaming and async SSR remain outside this
contract.
`pnpm check:hydration` verifies these explicit APIs against built artifacts in
Chromium, Firefox and WebKit, including JavaScript-disabled first paint, focus,
selection, DOM identity, mismatches, updates and disposal.
