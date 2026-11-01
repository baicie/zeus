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

### `Portal(props)` and `Transition(props)`

`Portal` returns its children inline: a server response has no portal position,
so the content belongs where the component renders it. `Transition` evaluates
`when` synchronously and returns `children` or its fallback; enter/leave
animation options are client-only and ignored. Both are exported from
`@zeus-js/zeus/server`, so SSR modules do not need to import the DOM entry.

### Context: `createContext`, `useContext`, `provide`, `inject`

The server context API mirrors the DOM runtime's owner tree with a dedicated
server owner type. A context created on the server is never the same object as
one created in the browser, and a value never crosses the boundary; the server
only needs it to render one request consistently.

```ts
import { createContext, useContext } from '@zeus-js/zeus/server'

const Theme = createContext<'light' | 'dark'>('light')
// …inside a component:
const theme = useContext(Theme)
```

`Provider` and `Bridge` both create a child owner for the duration of their
children, so `useContext()` inside them reads the provided value. `inject()`
walks the owner chain and falls back to the explicit argument, then the
context's default value, then throws. Provider chains follow synchronous scope
semantics: a provider does not survive an `await` inside a streaming source
(see the await-boundary rule in [RFC-018](../rfcs/RFC-018-streaming-ssr.md)).

`createSSROwner`, `runWithSSROwner`, `disposeSSROwner`, and `getSSRCurrentOwner`
are exported for the streaming runtime and for server integrations that need to
run code inside a request scope. They are runtime plumbing, not application
APIs; an application that needs shared values should use `createContext`.

### Schema helpers: `prop()` and `event()`

`prop()` and `event()` are the server counterparts of the DOM declaration
helpers. They return the same plain data, so a `defineElement` schema shared by
both targets compiles to the SSR entry without importing the DOM runtime:

```ts
import { defineElement, Host, prop, event } from '@zeus-js/zeus/server'

export const Tag = defineElement(
  'z-tag',
  {
    props: { open: prop(Boolean), label: prop(String) },
    emits: { close: event() },
  },
  props => Host({ children: props.label }),
)
```

They never read `document` or register an element.

### `renderToStream(render, options)` — experimental

Renders an SSR node, or an `AsyncIterable<SSRNode>`, into a
`ReadableStream<Uint8Array>`. This is a versioned experimental entry
(`SSR_STREAMING_API_VERSION`) and is fully independent of `renderToString()`,
whose synchronous contract is unchanged. Options are `signal` (an
`AbortSignal`; abort ends the stream with an `AbortError` and disposes the
request scope) and `flushAt` (minimum characters buffered before a chunk is
flushed, default 8 KiB).

The runtime chunks real serialized output, honors `ReadableStream`
backpressure, keeps already-flushed chunks readable when the source throws,
escapes every chunk with the same serializer as `renderToString()`, and gives
each request its own reactive root and context owner. A Promise returned by the
render factory, or found inside a yielded array, throws
`renderToStream() cannot serialize a Promise; await the value before yielding it.`
The complete contract, including unsupported boundaries, is
[RFC-018](../rfcs/RFC-018-streaming-ssr.md).

`serializeSSRNodeChunks(node, flushAt)` is the generator behind the static
path. It is exported for streaming integrations that build their own transport;
chunks are safe to concatenate but must not be parsed individually.

### Server Web Components

`defineElement(tag, options, setup)` is the SSR facade for a Zeus custom-element
definition. It evaluates `setup` once per invocation and returns the
custom-element host as a string-renderable node. It never touches `document`,
`HTMLElement`, `customElements`, or `ElementInternals`, and it does not
register a browser element.

When `shadow` is enabled, the result contains a Declarative Shadow DOM template
using `shadowrootmode` (and the requested `delegatesFocus` or `serializable`
flags). `styles` is emitted as the first `<style>` child of that template.
`Host` contributes host attributes and `Slot` emits native `<slot>` elements in
Shadow DOM mode. In Light DOM mode, the default `Slot` projects the consumer's
children into the server output; named Light DOM slots retain their fallback
because a string SSR node has no per-node `slot` metadata. Add explicit
`slot="name"` attributes to consumer nodes when the browser-side projection
needs named Light DOM slots.

`Host` follows the DOM property channels: `prop:*`, `on*`, and `ref` values are
client-only and are omitted from the server host HTML. Other Host values use the
same attribute normalization and escaping rules as `ssrAttr`.

The SSR prop policy is deliberately explicit. Static defaults are applied to
the setup props. A factory default cannot run during SSR and throws
`ZEUS_SSR_DEFAULT_FACTORY_UNSUPPORTED`; provide the value explicitly or move
that initialization to the client. Primitive props (`string`, `number`, and
`boolean`) become host attributes when passed explicitly or when their schema
sets `reflect: true`; `attr: false` and object, array, and function values stay
properties and are omitted from HTML. `formAssociated: true` preserves the
manifest metadata but does not emulate browser form callbacks or
`ElementInternals` on the server.

Generated component manifests can be consumed with
`ssrComponentFromManifest(manifest, tag, props, setup)`. The manifest must use
`schemaVersion: 1`; unknown tags and unsupported schema versions fail with a
structured `ZEUS_SSR_MANIFEST_*` error. Analyzer output carries component
`meta.shadow`, `meta.formAssociated`, and prop reflection/default metadata so
generated SSR code can apply the host, DSD, and attribute policy. CSS text is
not part of the `ComponentManifest`: `styles` belongs to the
`defineElement()` definition options and is emitted by that SSR facade. The
Manifest's `cssParts` and `cssVars` describe styling extension points; they do
not carry injectable CSS.

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
setup. Branch-owned nodes are marked optional so a server response that renders
only one conditional or list branch does not require markers from the inactive
branch. Repeated templates such as `For` rows reuse one template id;
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
