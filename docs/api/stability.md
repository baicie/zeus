# API Stability

Zeus separates application interfaces from compiler/runtime implementation details.

## @zeus-js/zeus

The main application entry exports:

- `createSignal`, `createMemo`, `createEffect`, `createRoot`, `onCleanup`, `batch`
- `render`, `Show`, `For`, `Host`, `Slot`, `defineElement`
- context helpers and the JSX runtime

Zeus is currently beta. A superseded beta interface is removed directly rather than retained as an alias or deprecated export.

## @zeus-js/zeus/server

The dedicated server entry exports the six reactive primitives,
`renderToString`, and the server implementations of `Show` and `For`. It does
not export DOM APIs or compiler runtime helpers.

## @zeus-js/signal

The main entry exports the same six reactive primitives. `@zeus-js/signal/internal` is reserved for Zeus packages and has no compatibility guarantee.

## @zeus-js/runtime-dom

DOM helpers are primarily compiler targets. Applications should prefer `@zeus-js/zeus`.

## @zeus-js/runtime-ssr

SSR helpers are a compiler/runtime contract. Applications should prefer
`@zeus-js/zeus/server`.
