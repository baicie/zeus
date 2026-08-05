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

When using the Babel compiler directly, set `generate: 'ssr'` and point
`moduleName` at the SSR runtime.

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

The initial SSR release does not hydrate the generated HTML. Mounting the same
application in a browser creates a fresh DOM tree. Streaming, asynchronous SSR,
and Web Components SSR are also outside the current contract.
