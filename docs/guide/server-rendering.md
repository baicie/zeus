# Server Rendering

Zeus can compile the same TSX source to server-side string rendering code. The
Vite plugin selects this target automatically while Vite is loading an SSR
module.

## Render HTML

Import the server API from the dedicated entry so a Node process does not load
the DOM runtime:

```tsx
import { For, Show, renderToString } from '@zeus-js/zeus/server'

function App(props: { signedIn: boolean; names: string[] }) {
  return (
    <main class="app">
      <Show when={props.signedIn} fallback={<p>Sign in</p>}>
        <ul>
          <For each={props.names}>{name => <li>{name}</li>}</For>
        </ul>
      </Show>
    </main>
  )
}

const html = renderToString(() => (
  <App signedIn={true} names={['Ada', 'Lin']} />
))
```

`renderToString` is synchronous. It executes the component tree once inside a
dedicated reactive scope, serializes the result, and disposes the scope before
returning. A Promise or custom thenable at any depth, including component
results, text, attributes, class, style, or property values, throws
`renderToString() does not support async render values.` Nothing in this API is
awaited or silently omitted.

## Vite Configuration

The normal plugin setup covers both browser and SSR transforms:

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
```

Browser transforms import `@zeus-js/runtime-dom`. SSR transforms import
`@zeus-js/runtime-ssr`. A custom SSR runtime can be selected independently:

```ts
zeus({ ssrModuleName: 'virtual:my-zeus-ssr-runtime' })
```

When using the Rust compiler adapter directly, call `transformModule` with
`target: 'ssr'` and `runtimeModule: '@zeus-js/runtime-ssr'`. The Vite plugin
selects these options for SSR module transforms.

## Serialization

Dynamic text and attribute values are HTML escaped. Nullish and boolean values
produce no text; false and nullish attributes are omitted; true attributes are
serialized without a value. Event handlers and refs are client-only and are not
included in server HTML.

`script` and `style` children follow HTML raw-text rules. Ordinary `<` and `&`
characters remain unchanged. A matching closing tag is rewritten safely after
all children have been joined, including closing tags split across fragments or
control-flow branches, so dynamic content cannot terminate the raw-text element
early. Script serialization also rewrites `<script` when an earlier `<!--` has
put the HTML tokenizer into its escaped state, preventing the tokenizer from
swallowing the following page in its double-escaped state.

Raw-text elements accept direct text expressions, Fragment, `Show`, and `For`.
Nested native elements or components fail compilation with
`ZEUS_UNSUPPORTED_SSR_RAW_TEXT_CHILD`; dynamic values that are already serialized
SSR fragments fail at runtime because their original text context cannot be
recovered.

SSR accepts `prop:*` only when the property has a deterministic HTML
representation for that element. The supported bindings are:

- `value` on `button`, `input`, `option`, and `textarea`;
- `checked` on `input` and `selected` on `option`;
- `multiple` on `input` and `select`;
- `disabled` on `button`, `fieldset`, `input`, `optgroup`, `option`, `select`,
  and `textarea`;
- `readOnly` on `input` and `textarea`;
- `htmlFor` on `label`, plus `tabIndex` on any element.

Supported properties serialize only string, number, and boolean values; other
value types are omitted. A serialized property binding replaces the equivalent
static attribute. `textarea` value is the exception: it becomes escaped text
content and replaces any JSX children. Other property/tag combinations, such as
`textContent`, `div.checked`, or `select.value`, fail compilation with the
structured `ZEUS_UNSUPPORTED_SSR_PROPERTY` diagnostic because they have no
equivalent static HTML representation.

## Web Component Wrappers

React and Vue Web Component wrappers use an SSR-0 contract. Server output
contains the custom element host tag (for example, `<z-button>`); it does not
render the component's Shadow DOM or Light DOM internals. String, number, and
boolean component props may be emitted as host attributes, including declared
attribute aliases. Object, array, function, unknown, and `attr: false` props
remain client-side properties and are omitted from the server HTML, so values
are never coerced to `[object Object]` or function source.

Wrapper SSR never registers a custom element. In the browser, the client
mounts a fresh tree, registers and upgrades the host, then assigns property
values. This is intentionally no hydration; a framework integration that
needs a browser-only custom element should place it behind its client boundary
(for example, a Next.js `"use client"` component). Declarative Shadow DOM,
streaming, and Web Component internal SSR are separate future contracts.

## Next.js Server and Client Boundaries

The [`examples/next-boundary`](https://github.com/baicie/zeus/tree/main/examples/next-boundary)
example builds its Web Component, Manifest, React wrapper, and declarations
through the public Rollup plugin before `next build`. It has two deliberate
host cases:

- A Server Component emits a static `<z-next-counter count="2">` host with
  serializable children. No `"use client"` directive, browser registration, or
  internal DOM execution is required for that HTML.
- An interactive counter exports a `"use client"` component because React
  state, event callbacks, refs, and object or function properties cross a
  browser boundary that Server Component props cannot serialize.

The generated wrapper is safe to import on the server. In the browser it
registers and upgrades the host, then mounts a fresh Shadow DOM; this example
does not claim Zeus internal-DOM hydration. A page that only needs the static
host may omit the client module entirely. A page that expects the host to
upgrade must load the generated registration entry in a Client Component.

`pnpm check:next-boundary` builds the production Next application and verifies
the disabled-JavaScript HTML plus upgrade, event, state, host identity, and
absence of hydration errors in Chromium, Firefox, and WebKit.

The initial SSR release does not hydrate the generated HTML. Mounting the same
application in a browser creates a fresh DOM tree. Streaming, asynchronous SSR,
and Web Component internal SSR are also outside the current contract; wrapper
host tag SSR is limited to the contract above.
