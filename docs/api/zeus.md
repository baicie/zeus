# @zeus-js/zeus

Unified entry point for the Zeus framework.

## Public APIs

The main entry exports stable, user-facing APIs:

| Export          | Description                         |
| --------------- | ----------------------------------- |
| `createSignal`  | Create a shallow getter/setter pair |
| `createMemo`    | Create a cached derived getter      |
| `createEffect`  | Create an owned reactive effect     |
| `createRoot`    | Create an explicit reactive owner   |
| `batch`         | Batch reactive updates              |
| `onCleanup`     | Register effect or owner cleanup    |
| `render`        | Mount a component tree to DOM       |
| `Show`          | Conditional rendering               |
| `For`           | List rendering                      |
| `Host`          | Web Component host boundary         |
| `Slot`          | Web Component slot projection       |
| `defineElement` | Define a custom element             |

## Internal APIs

Runtime helpers are **not** exported from the main entry.

`@zeus-js/runtime-dom`, `@zeus-js/runtime-ssr`, and
`@zeus-js/signal/internal` are compiler/framework implementation surfaces and
are not covered by application stability guarantees.

## Server Entry

Server rendering is exposed from a dedicated entry that does not load the DOM
runtime:

```ts
import { For, Show, createSignal, renderToString } from '@zeus-js/zeus/server'
```

`renderToString` accepts a synchronous render factory. See
[Server Rendering](/guide/server-rendering) for usage and current limitations.

## JSX Runtime

```ts
import { Fragment, jsx, jsxs, jsxDEV } from '@zeus-js/zeus'
```

## render

```ts
function render(
  code: JSXValue | (() => JSXValue),
  element: Element | DocumentFragment,
): () => void
```

Renders a component tree into a DOM element.

```tsx
import { render } from '@zeus-js/zeus'

const dispose = render(() => <App />, document.getElementById('root')!)

dispose()
```

## Show

See [Control Flow](/guide/control-flow) guide.

## For

See [Control Flow](/guide/control-flow) guide.

## defineElement

See [Web Components](/guide/web-components) guide.

## Host

See [Web Components](/guide/web-components) guide.

## Slot

See [Web Components](/guide/web-components) guide.
